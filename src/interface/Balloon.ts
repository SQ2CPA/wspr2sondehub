export default interface Balloon {
    active?: boolean;
    payload: string;
    band?: number;
    slots:
        | {
              callsign: number;
              telemetry: number;
          }
        | {
              callsign: number;
              telemetry: number;
          }[];
    traquito?: {
        flightID1?: string;
        flightID3?: string;
    };
    hamCallsign: string;
    comment: string;
    detail: string;
    device?: string;
    type: string;
    trackerType: string;
}
