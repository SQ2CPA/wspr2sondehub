import Balloon from "./Balloon";

export default interface Settings {
    aprs: {
        callsign: string;
        passcode: number;
    };
    uploadToSondehub: boolean;
    uploadToAPRS: boolean;
    balloons: Balloon[];
}
