import axios from "axios";
import Balloon from "../interface/Balloon";
import querystring from "querystring";

const BASE_URL = "http://db1.wspr.live/";

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

export default class WSPRAPi {
    async performQuery(aQuery: string): Promise<string> {
        const query = querystring.stringify({ query: aQuery });

        try {
            const response = await axios.get<string>(BASE_URL + "?" + query);

            return response.data.trim();
        } catch (error) {
            console.error("Error performing query:", error);

            throw error;
        }
    }

    async getReceivers(
        stime1: string,
        stime2: string,
        balloon: Balloon,
        secondCallsign?: string
    ): Promise<Receiver[]> {
        const rawQuery1 = (
            await this.performQuery(
                `SELECT rx_sign, frequency, snr, toString(time) as stime, rx_loc, version FROM wspr.rx WHERE (band='${balloon.band}') AND (time = '${stime1}') AND (tx_sign='${balloon.hamCallsign}') ORDER BY snr ASC LIMIT 10`
            )
        ).split("\n");

        const rawQuery2 = (
            await this.performQuery(
                `SELECT rx_sign, frequency, snr, toString(time) as stime, rx_loc, version FROM wspr.rx WHERE (band='${
                    balloon.band
                }') AND (time = '${stime2}') AND (tx_sign='${
                    secondCallsign || balloon.hamCallsign
                }') ORDER BY snr ASC LIMIT 10`
            )
        ).split("\n");

        const queries = [...rawQuery1, ...rawQuery2].map((o) => {
            const source = o.split("\t");

            return {
                callsign: source[0],
                frequency: Number(source[1]),
                snr: Number(source[2]),
                date: new Date(source[3]),
                locator: source[4],
                comment: source[5],
            };
        });

        return queries;
    }

    parseQuery(msg: string): QueryResult {
        const source = msg.split("\t");

        return {
            date: new Date(source[0]),
            band: source[1],
            callsign: source[2],
            locator: source[3],
            latitude: Number(source[4]),
            longitude: Number(source[5]),
            power: Number(source[6]),
            stime: source[7],
        };
    }
}
