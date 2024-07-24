import Balloon from "../interface/Balloon";
import net from "net";
import { Telemetry } from "./TelemetryParserApi";

export default class APRSISApi {
    constructor(
        private readonly callsign: string,
        private readonly passcode: number
    ) {}

    private processCoordinatesAPRS(coord, isLatitude) {
        const degrees = coord.toFixed(6).toString();
        let direction,
            coordinate = "",
            convDeg3;

        if (Math.abs(coord) < (isLatitude ? 10 : 100)) {
            coordinate += "0";
        }

        if (coord < 0) {
            direction = isLatitude ? "S" : "W";
            coordinate += degrees.substring(1, degrees.indexOf("."));
        } else {
            direction = isLatitude ? "N" : "E";
            coordinate += degrees.substring(0, degrees.indexOf("."));
        }

        let convDeg = Math.abs(coord) - Math.abs(parseInt(coord));
        let convDeg2 = (convDeg * 60) / 100;
        convDeg3 = convDeg2.toFixed(6);

        coordinate +=
            convDeg3.substring(
                convDeg3.indexOf(".") + 1,
                convDeg3.indexOf(".") + 3
            ) +
            "." +
            convDeg3.substring(
                convDeg3.indexOf(".") + 3,
                convDeg3.indexOf(".") + 5
            );
        coordinate += direction;

        return coordinate;
    }

    private convertCoordinates(lat, lon) {
        const latitude = this.processCoordinatesAPRS(lat, true);
        const longitude = this.processCoordinatesAPRS(lon, false);

        return { latitude, longitude };
    }

    async upload(telemetry: Telemetry, balloon: Balloon) {
        const connection = new net.Socket();

        console.log(
            `Connecting to APRSIS as ${this.callsign} using passcode: ${this.passcode}`
        );

        await connection.connect(14580, "euro.aprs2.net");

        console.log(`Connected`);

        connection.on("data", async (d) => {
            const packet: string = d.toString().trim();

            console.log(packet);
        });

        await connection.write(
            "user " +
                this.callsign +
                " pass " +
                this.passcode +
                " vers DEV DEV\r\n"
        );

        await new Promise((r) => setTimeout(r, 2000));

        const { latitude, longitude } = this.convertCoordinates(
            telemetry.latitude,
            telemetry.longitude
        );

        const packet = `${balloon.payload}>APLRG1,TCPIP,qAC:!${latitude}/${longitude}O000/000/A=000000/${balloon.device}`;

        console.log(packet);

        await connection.write(packet + "\r\n");

        await new Promise((r) => setTimeout(r, 2000));

        await connection.destroy();
    }
}
