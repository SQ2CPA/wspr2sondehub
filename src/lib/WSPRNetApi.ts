import axios, { AxiosInstance } from "axios";
import Balloon from "../interface/Balloon";
import { QueryResult, Receiver } from "../interface/WSPR";
import { load } from "cheerio";
import UtilsApi from "./UtilsApi";

export default class WSPRNetAPi {
    private client: AxiosInstance;

    constructor() {
        this.client = axios.create({
            baseURL: "http://wsprnet.org/",
        });
    }

    private async query(
        callsign: string,
        band: number,
        queryTime: number,
        slot: number
    ) {
        const response = await this.client.get<string>("/olddb", {
            params: {
                mode: "html",
                band: "all",
                limit: 200,
                findcall: callsign,
                findreporter: "",
                sort: "date",
            },
        });

        if (response.data.includes("No posts found")) return null;

        const $ = load(response.data);

        const rows = $("table").eq(2).find("tr");

        let spots: QueryResult[] = [];

        for (const row of rows) {
            const cols = $(row).find("td");

            const dateRaw = cols.eq(0).text().trim();

            if (dateRaw.length < 3) continue;

            const date = new Date(dateRaw + "Z");

            if (date.getTime() / 1000 < queryTime) continue;

            if (date.getMinutes() % 10 !== slot) continue;

            const locator = cols.eq(5).text().trim();

            const { latitude, longitude } =
                UtilsApi.getLocationFromLocator(locator);

            spots.push({
                date,
                band: band.toString(),
                callsign: cols.eq(1).text().trim(),
                locator,
                latitude,
                longitude,
                power: Number(cols.eq(6).text().trim().slice(1)),
                stime: date.toUTCString(),
            });
        }

        if (!spots.length) return null;

        const first = spots[0].date;

        spots = spots.filter((spot) => spot.date === first);

        if (!spots.length) return null;

        return spots;
    }

    async getCallsignSpots(
        balloon: Balloon,
        slot: number,
        queryTime: number
    ): Promise<QueryResult> {
        const spots = await this.query(
            balloon.hamCallsign,
            balloon.band,
            queryTime,
            slot
        );

        if (!spots) return null;

        return spots[0];
    }

    async getTelemetrySpots(
        balloon: Balloon,
        slot: number,
        queryTime: number
    ): Promise<QueryResult> {
        const spots = await this.query(
            balloon.hamCallsign,
            balloon.band,
            queryTime,
            slot
        );

        if (!spots) return null;

        return spots[0];
    }

    async getReceivers(
        stime1: string,
        stime2: string,
        balloon: Balloon
    ): Promise<Receiver[]> {
        const response = await this.client.get<string>("/olddb", {
            params: {
                mode: "html",
                band: "all",
                limit: 200,
                findcall: balloon.hamCallsign,
                findreporter: "",
                sort: "date",
            },
        });

        if (response.data.includes("No posts found")) return null;

        const $ = load(response.data);

        const rows = $("table").eq(2).find("tr");

        let receivers: Receiver[] = [];

        for (const row of rows) {
            const cols = $(row).find("td");

            const dateRaw = cols.eq(0).text().trim();

            if (dateRaw.length < 3) continue;

            const date = new Date(dateRaw + "Z");

            if (date.toUTCString() !== stime1 && date.toUTCString() !== stime2)
                continue;

            receivers.push({
                callsign: cols.eq(8).text().trim(),
                frequency: Number(cols.eq(2).text().trim()),
                snr: Number(cols.eq(3).text().trim()),
                date,
                locator: cols.eq(9).text().trim(),
                comment: cols.eq(13).text().trim(),
            });
        }

        return receivers;
    }
}
