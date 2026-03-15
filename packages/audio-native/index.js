const { existsSync, readFileSync } = require('fs')
const { join } = require('path')

const { platform, arch } = process

let nativeBinding = null

function isMusl() {
  if (!process.report || typeof process.report.getReport !== 'function') {
    try {
      const lddPath = require('child_process').execSync('which ldd').toString().trim()
      return readFileSync(lddPath, 'utf8').includes('musl')
    } catch (e) {
      return true
    }
  } else {
    const { glibcVersionRuntime } = process.report.getReport().header
    return !glibcVersionRuntime
  }
}

switch (platform) {
  case 'darwin':
    switch (arch) {
      case 'arm64':
        nativeBinding = require('./audio-native.darwin-arm64.node')
        break
      case 'x64':
        nativeBinding = require('./audio-native.darwin-x64.node')
        break
      default:
        throw new Error(`Unsupported architecture on macOS: ${arch}`)
    }
    break
  case 'linux':
    switch (arch) {
      case 'x64':
        if (isMusl()) {
          nativeBinding = require('./audio-native.linux-x64-musl.node')
        } else {
          nativeBinding = require('./audio-native.linux-x64-gnu.node')
        }
        break
      case 'arm64':
        if (isMusl()) {
          nativeBinding = require('./audio-native.linux-arm64-musl.node')
        } else {
          nativeBinding = require('./audio-native.linux-arm64-gnu.node')
        }
        break
      default:
        throw new Error(`Unsupported architecture on Linux: ${arch}`)
    }
    break
  default:
    throw new Error(`Unsupported OS: ${platform}`)
}

const { analyzeAudioFft, analyzeAudioFull } = nativeBinding

module.exports.analyzeAudioFft = analyzeAudioFft
module.exports.analyzeAudioFull = analyzeAudioFull
