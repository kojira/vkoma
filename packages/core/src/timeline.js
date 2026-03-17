export function getTimelineDuration(tracks) {
    return tracks.reduce((maxEndTime, track) => {
        const trackEndTime = track.items.reduce((itemMaxEndTime, item) => {
            return Math.max(itemMaxEndTime, item.startTime + item.duration);
        }, 0);
        return Math.max(maxEndTime, trackEndTime);
    }, 0);
}
export function getItemsAtTime(tracks, time) {
    return tracks.flatMap((track) => track.items.filter((item) => time >= item.startTime && time < item.startTime + item.duration));
}
