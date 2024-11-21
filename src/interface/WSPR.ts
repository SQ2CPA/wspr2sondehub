export interface QueryResult {
    date: Date;
    band: string;
    callsign: string;
    locator: string;
    latitude: number;
    longitude: number;
    power: number;
    stime: string;
}

export interface Receiver {
    callsign: string;
    frequency: number;
    snr: number;
    date: Date;
    locator: string;
    comment: string;
}
