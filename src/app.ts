import axios from "axios";
import querystring from "querystring";
import net from "net";

const BAND_20M = 14;

interface Balloon {
    payload: string;
    band: Number;
    slots: {
        callsign: Number;
        telemetry: Number;
    };
    flight_id_1: Number;
    flight_id_3: Number;
    hamCallsign: string;
    comment: string;
    detail: string;
    device: string;
    type: string;
    tracker_type: string;
}

const settings = {
    aprs: {
        callsign: "SR2CPA-11",
        passcode: 17074,
    },
    uploadToSondehub: true,
    uploadToAPRS: false,
    balloons: [
        {
            payload: "SQ2CPA-30",
            band: BAND_20M,
            slots: {
                callsign: 8,
                telemetry: 0,
            },
            flight_id_1: 0,
            flight_id_3: 0,
            hamCallsign: "SQ2CPA",
            comment: "SQ2CPA-11 for LoRa APRS",
            detail: "Launch date: 2024-07-15 07:00z",
            device: "LoRa APRS+WSPR tracker, 20m band",
            type: "ZachTek",
            tracker_type: "zachtek1",
        },
        {
            payload: "SQ2CPA-34",
            band: BAND_20M,
            slots: {
                callsign: 8,
                telemetry: 0,
            },
            flight_id_1: 0,
            flight_id_3: 0,
            hamCallsign: "SQ2CPA/1",
            comment: "SP2BYD-11 for LoRa APRS",
            detail: "Launch date: 2024-07-20 07:00z",
            device: "LoRa APRS+WSPR tracker, 20m band",
            type: "ZachTek",
            tracker_type: "zachtek1",
        },
    ],
};

interface QueryResult {
    date: Date;
    band: string;
    callsign: string;
    locator: string;
    latitude: number;
    longitude: number;
    power: number;
    frequency: number;
    rxCallsign: string;
}

function parseQuery(msg: string): QueryResult {
    const source = msg.split("\t");

    return {
        date: new Date(source[0]),
        band: source[1],
        callsign: source[2],
        locator: source[3],
        latitude: Number(source[4]),
        longitude: Number(source[5]),
        power: Number(source[6]),
        frequency: Number(source[7]),
        rxCallsign: source[9],
    };
}

async function performQuery(aQuery: string): Promise<string> {
    const query = querystring.stringify({ query: aQuery });

    try {
        const response = await axios.get<string>(
            "http://db1.wspr.live/?" + query
        );

        return response.data.trim();
    } catch (error) {
        console.error("Error performing query:", error);

        throw error;
    }
}

interface SondehubPayload {
    dev?: boolean;
    software_name: string;
    software_version: string;
    uploader_callsign: string;
    frequency: number;
    modulation: string;
    comment: string;
    detail: string;
    device: string;
    type: string;
    time_received: string;
    datetime: string;
    payload_callsign: string;
    lat: Number;
    lon: Number;
    alt: Number;
}

function processCoordinatesAPRS(coord, isLatitude) {
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

function convertCoordinates(lat, lon) {
    const latitude = processCoordinatesAPRS(lat, true);
    const longitude = processCoordinatesAPRS(lon, false);

    return { latitude, longitude };
}

async function decodeZachtek1(
    balloon: Balloon,
    query1: QueryResult,
    query2: QueryResult
) {
    const date = query2.date;

    const p1 = query1.power;
    const p2 = query2.power;

    console.log(`Powers: ${p1} ${p2}`);

    let altitude = 0;

    if ((p1 === 60 && p2 === 60) || balloon.payload === "SQ2CPA-30") {
        console.log(`Got invalid altitude`);
    } else {
        altitude = p1 * 300 + p2 * 20;

        console.log(`Got altitude: ${altitude}`);
    }

    const locator = query2.locator;
    console.log(`Got locator: ${locator}`);

    if (settings.uploadToAPRS) {
        const connection = new net.Socket();

        console.log(
            `Connecting to APRSIS as ${settings.aprs.callsign} using passcode: ${settings.aprs.passcode}`
        );

        await connection.connect(14580, "euro.aprs2.net");

        console.log(`Connected`);

        connection.on("data", async (d) => {
            const packet: string = d.toString().trim();

            console.log(packet);
        });

        await connection.write(
            "user " +
                settings.aprs.callsign +
                " pass " +
                settings.aprs.passcode +
                " vers DEV DEV\r\n"
        );

        await new Promise((r) => setTimeout(r, 2000));

        const { latitude, longitude } = convertCoordinates(
            query1.latitude,
            query1.longitude
        );

        const packet = `${balloon.payload}>APLRG1,TCPIP,qAC:!${latitude}/${longitude}O000/000/A=000000/${balloon.device}`;

        console.log(packet);

        await connection.write(packet + "\r\n");

        await new Promise((r) => setTimeout(r, 2000));

        await connection.destroy();
    }

    if (settings.uploadToSondehub) {
        const data: SondehubPayload = {
            software_name: "SQ2CPA wspr2sondechub",
            software_version: "1.0.0",
            uploader_callsign: query2.rxCallsign,
            frequency: 0.0,
            modulation: "WSPR",
            comment:
                balloon.comment +
                " - RX by " +
                query1.rxCallsign +
                " " +
                query2.rxCallsign,
            detail: balloon.detail,
            device: balloon.device,
            type: balloon.type,
            time_received: "2024-01-01",
            datetime: "2024-01-01",
            payload_callsign: balloon.payload,
            lat: query2.latitude,
            lon: query2.longitude,
            alt: altitude,
        };

        date.setHours(date.getHours() + 2);

        data.frequency = query1.frequency / 1000000;
        data.time_received = date.toISOString();
        data.datetime = data.time_received;

        const response = await axios({
            url: "https://api.v2.sondehub.org/amateur/telemetry",
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Accept: "text/plain",
            },
            data: [data],
        });

        console.log(JSON.stringify(response.data));
    }
}

(async function () {
    for (const balloon of settings.balloons) {
        console.log(`Checking balloon: ${balloon.payload}`);

        const queryTime = Math.floor(Date.now() / 1000) - 30 * 60;

        const callsignTimeslot =
            "____-__-__ __:_" + balloon.slots.callsign + "%";

        const telemetryTimeslot =
            "____-__-__ __:_" + balloon.slots.telemetry + "%";

        const msg1 = await performQuery(
            `SELECT toString(time) as stime, band, tx_sign, tx_loc, tx_lat, tx_lon, power, frequency, time, rx_sign FROM wspr.rx WHERE (band='${balloon.band}') AND (stime LIKE '${callsignTimeslot}') AND (time > ${queryTime}) AND (tx_sign='${balloon.hamCallsign}') ORDER BY time DESC LIMIT 1`
        );

        const msg2 = await performQuery(
            `SELECT toString(time) as stime, band, tx_sign, tx_loc, tx_lat, tx_lon, power, frequency, time, rx_sign FROM wspr.rx WHERE (band='${balloon.band}') AND (stime LIKE '${telemetryTimeslot}') AND (time > ${queryTime}) AND (tx_sign='${balloon.hamCallsign}') ORDER BY time DESC LIMIT 1`
        );

        if (!msg1.length || !msg2.length) continue;

        console.log(msg1);
        console.log(msg2);

        const query1 = parseQuery(msg1);
        const query2 = parseQuery(msg2);

        const timeDiff = (query2.date.getTime() - query1.date.getTime()) / 1000;

        if (timeDiff !== 120) {
            console.error(`Invalid time diff: ${timeDiff}`);
            continue;
        }

        await decodeZachtek1(balloon, query1, query2);
    }
})();
