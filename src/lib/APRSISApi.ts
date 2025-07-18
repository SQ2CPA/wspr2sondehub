import Balloon from "../interface/Balloon";
import net from "net";
import { Telemetry } from "./TelemetryParserApi";
import { Receiver } from "../interface/WSPR";

export default class APRSISApi {
    constructor() {}

    private getPasscode(callsign: string) {
        let stophere = callsign.indexOf("-");

        if (stophere !== -1) {
            callsign = callsign.substring(0, stophere);
        }

        let realcall = callsign.substring(0, 10).toUpperCase();

        let hash = 0x73e2;
        let i = 0;
        let len = realcall.length;

        while (i < len) {
            hash ^= realcall.charCodeAt(i) << 8;
            if (i + 1 < len) {
                hash ^= realcall.charCodeAt(i + 1);
            }
            i += 2;
        }

        return hash & 0x7fff;
    }

    private processCoordinatesAPRS(coord: number, isLatitude: boolean): string {
        const direction = isLatitude
            ? coord >= 0
                ? "N"
                : "S"
            : coord >= 0
            ? "E"
            : "W";

        const absCoord = Math.abs(coord);
        const degrees = Math.floor(absCoord);
        const minutes = (absCoord - degrees) * 60;

        let degreesStr: string;
        if (isLatitude) {
            degreesStr = degrees.toString().padStart(2, "0");
        } else {
            degreesStr = degrees.toString().padStart(3, "0");
        }

        const minutesStr = minutes.toFixed(2).padStart(5, "0");

        const aprsCoord = degreesStr + minutesStr;

        return aprsCoord + direction;
    }

    private convertCoordinates(lat, lon) {
        const latitude = this.processCoordinatesAPRS(lat, true);
        const longitude = this.processCoordinatesAPRS(lon, false);

        return { latitude, longitude };
    }

    async upload(
        telemetry: Telemetry,
        balloon: Balloon,
        receivers: Receiver[]
    ) {
        const connection = new net.Socket();

        const callsign = balloon.payload.split("-")[0];
        const passcode = this.getPasscode(callsign);

        console.log(
            `Connecting to APRSIS as ${callsign} using passcode: ${passcode}`
        );

        await connection.connect(14580, "euro.aprs2.net");

        console.log(`Connected to APRSIS`);

        connection.on("data", async (d) => {
            const packet: string = d.toString().trim();

            // console.log(packet);
        });

        await connection.write(
            "user " +
                callsign +
                " pass " +
                passcode +
                " vers uploader.sp0lnd.pl\r\n"
        );

        await new Promise((r) => setTimeout(r, 2000));

        const { latitude, longitude } = this.convertCoordinates(
            telemetry.latitude,
            telemetry.longitude
        );

        let taltitude = (telemetry.altitude * 3.28084).toFixed(0) + "";

        while (taltitude.length < 6) taltitude = "0" + taltitude;

        const timestamp = telemetry.date
            .split("T")
            .pop()
            .split(".")[0]
            .replace(/:/g, "");

        const packet1 = `${
            balloon.payload
        }>APZHUB,NOHUB,qAC:@${timestamp}!${latitude}/${longitude}O000/000/A=${taltitude}/${
            balloon.device || balloon.comment
        } (${balloon.hamCallsign})`;

        console.log(packet1);
        await connection.write(packet1 + "\r\n");

        const packet2 = `${balloon.payload}>APZHUB,NOHUB,qAC:>RX by: ${receivers
            .map((o) => o.callsign)
            .join()}`;

        console.log(packet2);
        await connection.write(packet2 + "\r\n");

        await new Promise((r) => setTimeout(r, 2000));

        await connection.destroy();
    }
}
