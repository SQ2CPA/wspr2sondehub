import Balloon from "../interface/Balloon";
import UtilsApi from "./UtilsApi";
import { QueryResult } from "./WSPRApi";

export interface Telemetry {
    date: string;
    latitude: number;
    longitude: number;
    altitude: number;
    gps?: number;
    voltage?: number;
    sats?: number;
    temperature?: number;
    velocityHorizontal?: number;
}

const POW2DEC = {
    "0": 0,
    "3": 1,
    "7": 2,
    "10": 3,
    "13": 4,
    "17": 5,
    "20": 6,
    "23": 7,
    "27": 8,
    "30": 9,
    "33": 10,
    "37": 11,
    "40": 12,
    "43": 13,
    "47": 14,
    "50": 15,
    "53": 16,
    "57": 17,
    "60": 18,
};

export default class TelemetryParserApi {
    async decodeZachtek1(
        balloon: Balloon,
        query1: QueryResult,
        query2: QueryResult
    ): Promise<Telemetry> {
        const date = query2.date;

        const power1 = query1.power;
        const power2 = query2.power;

        console.log(`Powers: ${power1} ${power2}`);

        let altitude = 0;

        if (power1 === 60 && power2 === 60) {
            console.log(`Got invalid altitude (max dBm)`);
        } else {
            altitude = power1 * 300 + power2 * 20;

            console.log(`Got altitude: ${altitude}`);
        }

        const locator = query2.locator;
        console.log(`Got locator: ${locator}`);

        return {
            date: date.toISOString(),
            latitude: query2.latitude,
            longitude: query2.longitude,
            altitude,
        };
    }

    async decodeTraquito(
        balloon: Balloon,
        query1: QueryResult,
        query2: QueryResult
    ): Promise<Telemetry> {
        const date = query2.date;

        let maidenHead = query1.locator.substring(0, 4);
        let c1: number | string = query2.callsign[1];
        c1 = /^[a-zA-Z]$/.test(c1)
            ? c1.charCodeAt(0) - 55
            : c1.charCodeAt(0) - 48;
        const c2 = query2.callsign.charCodeAt(3) - 65;
        const c3 = query2.callsign.charCodeAt(4) - 65;
        const c4 = query2.callsign.charCodeAt(5) - 65;
        const l1 = query2.locator.charCodeAt(0) - 65;
        const l2 = query2.locator.charCodeAt(1) - 65;
        const l3 = query2.locator.charCodeAt(2) - 48;
        const l4 = query2.locator.charCodeAt(3) - 48;
        const p = POW2DEC[query2.power];

        const sum1 = c1 * 26 * 26 * 26 + c2 * 26 * 26 + c3 * 26 + c4;
        const sum2 =
            l1 * 18 * 10 * 10 * 19 +
            l2 * 10 * 10 * 19 +
            l3 * 10 * 19 +
            l4 * 19 +
            p;

        const lsub1 = Math.floor(sum1 / 25632);
        const lsub2_tmp = sum1 - lsub1 * 25632;
        const lsub2 = Math.floor(lsub2_tmp / 1068);

        const altitude = (lsub2_tmp - lsub2 * 1068) * 20;

        const subloc =
            String.fromCharCode(lsub1 + 65) + String.fromCharCode(lsub2 + 65);
        const finalMaidenHead = maidenHead + subloc.toLowerCase();

        console.log("Locator: " + finalMaidenHead);

        const temp_1 = Math.floor(sum2 / 6720);
        const temp_2 = temp_1 * 2 + 457;
        const temperature = Math.round((temp_2 * 500) / 1024 - 273);

        console.log("Temperature: " + temperature);

        const batt_1 = sum2 - temp_1 * 6720;
        const batt_2 = Math.floor(batt_1 / 168);
        const batt_3 = batt_2 * 10 + 614;
        const voltage = (batt_3 * 5) / 1024 - 0.96;

        console.log("Voltage: " + voltage);

        const t1 = sum2 - temp_1 * 6720;
        const t2 = Math.floor(t1 / 168);
        const t3 = t1 - t2 * 168;
        const t4 = Math.floor(t3 / 4);
        const speed = t4 * 2;
        const r7 = t3 - t4 * 4;
        const gps = Math.floor(r7 / 2);
        const sats = r7 % 2;

        console.log("Speed: " + speed);
        console.log("GPS: " + gps);
        console.log("Sats: " + sats);

        const mps = speed * 0.514444;

        const upperMaidenHead = finalMaidenHead.toUpperCase();

        const { longitude, latitude } =
            UtilsApi.getLocationFromLocator(upperMaidenHead);

        console.log("Latitude: " + latitude);
        console.log("Longitude: " + longitude);
        console.log("Altitude: " + altitude);

        return {
            date: date.toISOString(),
            latitude,
            longitude,
            altitude,
            sats,
            gps,
            velocityHorizontal: mps,
            temperature,
        };
    }
}
