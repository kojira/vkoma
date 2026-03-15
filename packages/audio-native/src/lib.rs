#![deny(clippy::all)]

use napi::bindgen_prelude::*;
use napi_derive::napi;
use rustfft::{FftPlanner, num_complex::Complex};

const FFT_SIZE: usize = 2048;
const SAMPLE_RATE: u32 = 44100;

fn hanning(n: usize, capital_n: usize) -> f32 {
    0.5 * (1.0 - (2.0 * std::f32::consts::PI * n as f32 / (capital_n - 1) as f32).cos())
}

fn freq_to_bin(freq: f64) -> usize {
    ((freq * FFT_SIZE as f64) / SAMPLE_RATE as f64).round() as usize
}

/// Analyze audio PCM data using FFT and return per-frame band energies (normalized 0-1).
///
/// # Arguments
/// * `pcm_data` - Raw PCM samples as Float32Array (mono, 44100Hz)
/// * `sample_rate` - Sample rate
/// * `fps` - Frames per second
/// * `bands` - Array of [low_freq, high_freq] pairs defining frequency bands
#[napi]
pub fn analyze_audio_fft(
    pcm_data: Float32Array,
    sample_rate: u32,
    fps: u32,
    bands: Vec<Vec<f64>>,
) -> Vec<Vec<f64>> {
    let pcm = pcm_data.as_ref();
    let actual_sample_rate = if sample_rate == 0 { SAMPLE_RATE } else { sample_rate };
    let frame_samples = actual_sample_rate as f64 / fps as f64;
    let total_frames = (pcm.len() as f64 / frame_samples).floor() as usize;

    if total_frames == 0 || bands.is_empty() {
        return vec![];
    }

    let mut planner = FftPlanner::<f32>::new();
    let fft = planner.plan_fft_forward(FFT_SIZE);

    // Pre-compute band bins
    let band_bins: Vec<(usize, usize)> = bands
        .iter()
        .map(|b| {
            let lo = b.first().copied().unwrap_or(0.0);
            let hi = b.get(1).copied().unwrap_or(lo);
            let b0 = freq_to_bin(lo).min(FFT_SIZE / 2 - 1);
            let b1 = freq_to_bin(hi).min(FFT_SIZE / 2 - 1);
            if b1 >= b0 { (b0, b1) } else { (b0, b0) }
        })
        .collect();

    let num_bands = bands.len();
    let mut raw_band_energies: Vec<Vec<f64>> = Vec::with_capacity(total_frames);
    let mut max_band_energy: Vec<f64> = vec![0.0f64; num_bands];
    let mut scratch = vec![Complex::new(0.0f32, 0.0f32); FFT_SIZE];

    for frame_idx in 0..total_frames {
        let center_sample = ((frame_idx as f64 + 0.5) * frame_samples).round() as usize;
        let start_sample = center_sample.saturating_sub(FFT_SIZE / 2);

        let mut buffer: Vec<Complex<f32>> = (0..FFT_SIZE)
            .map(|i| {
                let sample_idx = start_sample + i;
                let sample = pcm.get(sample_idx).copied().unwrap_or(0.0);
                Complex::new(sample * hanning(i, FFT_SIZE), 0.0)
            })
            .collect();

        fft.process_with_scratch(&mut buffer, &mut scratch);

        let magnitudes: Vec<f32> = buffer[..FFT_SIZE / 2]
            .iter()
            .map(|c| (c.re * c.re + c.im * c.im).sqrt())
            .collect();

        let band_energies: Vec<f64> = band_bins
            .iter()
            .map(|(b0, b1)| {
                let count = (b1 - b0 + 1).max(1);
                let sum: f32 = magnitudes[*b0..=*b1].iter().map(|m| m * m).sum();
                ((sum / count as f32) as f64).sqrt()
            })
            .collect();

        for (b, &e) in band_energies.iter().enumerate() {
            if e > max_band_energy[b] {
                max_band_energy[b] = e;
            }
        }
        raw_band_energies.push(band_energies);
    }

    // Normalize to 0-1
    raw_band_energies
        .into_iter()
        .map(|frame| {
            frame
                .iter()
                .enumerate()
                .map(|(b, &e)| {
                    if max_band_energy[b] > 1e-10 {
                        (e / max_band_energy[b]).min(1.0)
                    } else {
                        0.0
                    }
                })
                .collect()
        })
        .collect()
}

/// Full analysis with beat detection.
/// Returns frames where each frame is [band0, band1, ..., rms, beat(0|1), beatIntensity]
#[napi]
pub fn analyze_audio_full(
    pcm_data: Float32Array,
    sample_rate: u32,
    fps: u32,
    bands: Vec<Vec<f64>>,
) -> Vec<Vec<f64>> {
    let pcm = pcm_data.as_ref();
    let actual_sample_rate = if sample_rate == 0 { SAMPLE_RATE } else { sample_rate };
    let frame_samples = actual_sample_rate as f64 / fps as f64;
    let total_frames = (pcm.len() as f64 / frame_samples).floor() as usize;

    if total_frames == 0 {
        return vec![];
    }

    let mut planner = FftPlanner::<f32>::new();
    let fft = planner.plan_fft_forward(FFT_SIZE);

    let band_bins: Vec<(usize, usize)> = bands
        .iter()
        .map(|b| {
            let lo = b.first().copied().unwrap_or(0.0);
            let hi = b.get(1).copied().unwrap_or(lo);
            let b0 = freq_to_bin(lo).min(FFT_SIZE / 2 - 1);
            let b1 = freq_to_bin(hi).min(FFT_SIZE / 2 - 1);
            if b1 >= b0 { (b0, b1) } else { (b0, b0) }
        })
        .collect();

    let low_bin0 = freq_to_bin(20.0).min(FFT_SIZE / 2 - 1);
    let low_bin1 = freq_to_bin(150.0).min(FFT_SIZE / 2 - 1);

    let num_bands = bands.len();
    let mut raw_band_energies: Vec<Vec<f64>> = Vec::with_capacity(total_frames);
    let mut max_band_energy: Vec<f64> = vec![0.0f64; num_bands];
    let mut rms_values: Vec<f64> = Vec::with_capacity(total_frames);
    let mut low_freq_energies: Vec<f64> = Vec::with_capacity(total_frames);
    let mut max_rms: f64 = 1e-10;
    let mut max_low: f64 = 1e-10;

    let mut scratch = vec![Complex::new(0.0f32, 0.0f32); FFT_SIZE];

    for frame_idx in 0..total_frames {
        let center_sample = ((frame_idx as f64 + 0.5) * frame_samples).round() as usize;
        let start_sample = center_sample.saturating_sub(FFT_SIZE / 2);

        let mut buffer: Vec<Complex<f32>> = (0..FFT_SIZE)
            .map(|i| {
                let sample_idx = start_sample + i;
                let sample = pcm.get(sample_idx).copied().unwrap_or(0.0);
                Complex::new(sample * hanning(i, FFT_SIZE), 0.0)
            })
            .collect();

        fft.process_with_scratch(&mut buffer, &mut scratch);

        let magnitudes: Vec<f32> = buffer[..FFT_SIZE / 2]
            .iter()
            .map(|c| (c.re * c.re + c.im * c.im).sqrt())
            .collect();

        // RMS
        let rms_sum: f32 = magnitudes.iter().map(|m| m * m).sum();
        let rms = ((rms_sum / (FFT_SIZE / 2) as f32) as f64).sqrt();
        if rms > max_rms { max_rms = rms; }
        rms_values.push(rms);

        // Low freq energy
        let low_count = (low_bin1 - low_bin0 + 1).max(1);
        let low_sum: f32 = magnitudes[low_bin0..=low_bin1].iter().map(|m| m * m).sum();
        let low_e = ((low_sum / low_count as f32) as f64).sqrt();
        if low_e > max_low { max_low = low_e; }
        low_freq_energies.push(low_e);

        // Band energies
        let band_energies: Vec<f64> = band_bins
            .iter()
            .map(|(b0, b1)| {
                let count = (b1 - b0 + 1).max(1);
                let sum: f32 = magnitudes[*b0..=*b1].iter().map(|m| m * m).sum();
                ((sum / count as f32) as f64).sqrt()
            })
            .collect();

        for (b, &e) in band_energies.iter().enumerate() {
            if e > max_band_energy[b] {
                max_band_energy[b] = e;
            }
        }
        raw_band_energies.push(band_energies);
    }

    // Beat detection + final output
    let window_frames = (fps as usize).max(1);
    let mut beat_intensity = 0.0f64;
    let mut result: Vec<Vec<f64>> = Vec::with_capacity(total_frames);

    for frame_idx in 0..total_frames {
        let w_start = frame_idx.saturating_sub(window_frames);
        let w_count = (frame_idx - w_start).max(1);
        let w_sum: f64 = low_freq_energies[w_start..frame_idx].iter().sum();
        let w_avg = w_sum / w_count as f64;

        let beat = low_freq_energies[frame_idx] > (1.5 * w_avg).max(max_low * 0.1);
        if beat {
            beat_intensity = 1.0;
        } else {
            beat_intensity *= 0.85;
        }

        let normalized_bands: Vec<f64> = raw_band_energies[frame_idx]
            .iter()
            .enumerate()
            .map(|(b, &e)| {
                if max_band_energy[b] > 1e-10 {
                    (e / max_band_energy[b]).min(1.0)
                } else {
                    0.0
                }
            })
            .collect();

        let rms_norm = rms_values[frame_idx] / max_rms;
        let beat_val = if beat { 1.0f64 } else { 0.0f64 };

        let mut frame_data = normalized_bands;
        frame_data.push(rms_norm);
        frame_data.push(beat_val);
        frame_data.push(beat_intensity);

        result.push(frame_data);
    }

    result
}
