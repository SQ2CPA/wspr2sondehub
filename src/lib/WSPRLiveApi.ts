import axios, { AxiosInstance } from "axios";
import Balloon from "../interface/Balloon";
import querystring from "querystring";
import { QueryResult, Receiver } from "../interface/WSPR";
import { TYPE_TRAQUITO, TYPE_ZACHTEK } from "../consts";

export default class WSPRLiveAPi {
    private client: AxiosInstance;

    constructor() {
        this.client = axios.create({
            baseURL: "http://db1.wspr.live/",
        });
    }

    private async performQuery(aQuery: string): Promise<string> {
        const query = querystring.stringify({ query: aQuery });

        try {
            const response = await this.client.get<string>("?" + query);

            return response.data.trim();
        } catch (error) {
            console.error("Error performing query:", error);

            throw error;
        }
    }

    async getCallsignSpots(balloon: Balloon, slot: number, queryTime: number) {
        const bandWhere = !balloon.band ? "" : `(band='${balloon.band}') AND `;

        const callsignTimeslot = "____-__-__ __:_" + slot + "%";

        const query = await this.performQuery(
            `SELECT toString(time) as stime, band, tx_sign, tx_loc, tx_lat, tx_lon, power, stime FROM wspr.rx WHERE ${bandWhere}(stime LIKE '${callsignTimeslot}') AND (time > ${queryTime}) AND (tx_sign='${balloon.hamCallsign}') ORDER BY time DESC LIMIT 1`
        );

        if (!query || !query.length) return null;

        return this.parseQuery(query);
    }

    async getTelemetrySpots(balloon: Balloon, slot: number, queryTime: number) {
        const bandWhere = !balloon.band ? "" : `(band='${balloon.band}') AND `;

        const telemetryTimeslot = "____-__-__ __:_" + slot + "%";

        let query = "";

        if (balloon.type === TYPE_ZACHTEK) {
            query = await this.performQuery(
                `SELECT toString(time) as stime, band, tx_sign, tx_loc, tx_lat, tx_lon, power, stime FROM wspr.rx WHERE ${bandWhere}(stime LIKE '${telemetryTimeslot}') AND (time > ${queryTime}) AND (tx_sign='${balloon.hamCallsign}') ORDER BY time DESC LIMIT 1`
            );
        } else if (balloon.type === TYPE_TRAQUITO) {
            const flightID =
                balloon.traquito.flightID1 +
                "_" +
                balloon.traquito.flightID3 +
                "%";

            query = await this.performQuery(
                `SELECT toString(time) as stime, band, tx_sign, tx_loc, tx_lat, tx_lon, power, stime FROM wspr.rx WHERE ${bandWhere}(stime LIKE '${telemetryTimeslot}') AND (time > ${queryTime}) AND (tx_sign LIKE '${flightID}') ORDER BY time DESC LIMIT 1`
            );
        }

        if (!query || !query.length) return null;

        return this.parseQuery(query);
    }

    async getReceivers(
        stime1: string,
        stime2: string,
        balloon: Balloon,
        secondCallsign?: string
    ): Promise<Receiver[]> {
        const bandWhere = !balloon.band ? "" : `(band='${balloon.band}') AND `;

        const rawQuery1 = (
            await this.performQuery(
                `SELECT rx_sign, frequency, snr, toString(time) as stime, rx_loc, version FROM wspr.rx WHERE ${bandWhere}(time = '${stime1}') AND (tx_sign='${balloon.hamCallsign}') ORDER BY snr ASC LIMIT 10`
            )
        ).split("\n");

        const rawQuery2 = (
            await this.performQuery(
                `SELECT rx_sign, frequency, snr, toString(time) as stime, rx_loc, version FROM wspr.rx WHERE ${bandWhere}(time = '${stime2}') AND (tx_sign='${
                    secondCallsign || balloon.hamCallsign
                }') ORDER BY snr ASC LIMIT 10`
            )
        ).split("\n");

        const queries = [...rawQuery1, ...rawQuery2]
            .map((o) => {
                const source = o.split("\t");

                return {
                    callsign: source[0],
                    frequency: Number(source[1]) / 1000000,
                    snr: Number(source[2]),
                    date: new Date(source[3]),
                    locator: source[4],
                    comment: source[5],
                };
            })
            .reduce((acc, current) => {
                if (!acc.find((item) => item.callsign === current.callsign)) {
                    acc.push(current);
                }

                return acc;
            }, [])
            .sort((a, b) => a.snr - b.snr)
            .slice(0, 10);

        return queries;
    }

    private parseQuery(msg: string): QueryResult {
        const source = msg.split("\t");

        return {
            date: new Date(source[0] + "Z"),
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
