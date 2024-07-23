import axios from "axios";
import querystring from "querystring";
import net from "net";

const BAND_20M = 14;

const TYPE_ZACHTEK = "ZachTek";
const TYPE_TRAQUITO = "Jetpack";

interface Balloon {
    active?: boolean;
    payload: string;
    band: number;
    slots: {
        callsign: number;
        telemetry: number;
    };
    traquito?: {
        flightID1?: number;
        flightID3?: number;
    };
    hamCallsign: string;
    comment: string;
    detail: string;
    device?: string;
    type: string;
    trackerType: string;
}

interface Settings {
    aprs: {
        callsign: string;
        passcode: number;
    };
    uploadToSondehub: boolean;
    uploadToAPRS: boolean;
    balloons: Balloon[];
}

const settings: Settings = {
    aprs: {
        callsign: "SR2CPA-11",
        passcode: 17074,
    },
    uploadToSondehub: true,
    uploadToAPRS: false,
    balloons: [
        {
            active: true,
            payload: "SP2ROC-30",
            band: BAND_20M,
            slots: {
                callsign: 4,
                telemetry: 6,
            },
            traquito: {
                flightID1: 1,
                flightID3: 6,
            },
            hamCallsign: "SP2ROC",
            comment: "SAG ClearPico,He,11.7g PL,6g FL",
            detail: "Launch Date: 2024-05-26 09:00z",
            type: TYPE_TRAQUITO,
            trackerType: "traquito",
        },
        {
            payload: "SQ2CPA-30",
            band: BAND_20M,
            slots: {
                callsign: 8,
                telemetry: 0,
            },
            hamCallsign: "SQ2CPA",
            comment: "SQ2CPA-11 for LoRa APRS",
            detail: "Launch date: 2024-07-15 07:00z",
            device: "LoRa APRS+WSPR tracker, 20m band",
            type: TYPE_ZACHTEK,
            trackerType: "zachtek1",
        },
        {
            payload: "SQ2CPA-34",
            band: BAND_20M,
            slots: {
                callsign: 8,
                telemetry: 0,
            },
            hamCallsign: "SQ2CPA/1",
            comment: "SP2BYD-11 for LoRa APRS",
            detail: "Launch date: 2024-07-20 07:00z",
            device: "LoRa APRS+WSPR tracker, 20m band",
            type: TYPE_ZACHTEK,
            trackerType: "zachtek1",
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
    stime: string;
}

interface Receiver {
    callsign: string;
    frequency: number;
    snr: number;
    date: Date;
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
        stime: source[7],
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
    snr: number;
    modulation: string;
    comment: string;
    detail: string;
    device?: string;
    type: string;
    time_received: string;
    datetime: string;
    payload_callsign: string;
    lat: number;
    lon: number;
    alt: number;
    batt?: number;
    sats?: number;
    gps?: number;
    temp?: number;
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

async function uploadToAPRSIS(query1: QueryResult, balloon: Balloon) {
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

async function getReceivers(
    stime1: string,
    stime2: string,
    balloon: Balloon,
    secondCallsign?: string
): Promise<Receiver[]> {
    const rawQuery1 = (
        await performQuery(
            `SELECT rx_sign, frequency, snr, toString(time) as stime FROM wspr.rx WHERE (band='${balloon.band}') AND (time = '${stime1}') AND (tx_sign='${balloon.hamCallsign}') ORDER BY snr ASC LIMIT 10`
        )
    ).split("\n");

    const rawQuery2 = (
        await performQuery(
            `SELECT rx_sign, frequency, snr, toString(time) as stime FROM wspr.rx WHERE (band='${
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
        };
    });

    return queries;
}

async function uploadToSondehub(data: SondehubPayload[]) {
    const response = await axios({
        url: "https://api.v2.sondehub.org/amateur/telemetry",
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            Accept: "text/plain",
        },
        data,
    });

    console.log(JSON.stringify(response.data));
}

const pow2dec = {
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

async function decodeTraquito(
    balloon: Balloon,
    query1: QueryResult,
    query2: QueryResult
) {
    const date = query2.date;

    let maidenHead = query1.locator.substring(0, 4);
    let c1: number | string = query2.callsign[1];
    c1 = /^[a-zA-Z]$/.test(c1) ? c1.charCodeAt(0) - 55 : c1.charCodeAt(0) - 48;
    const c2 = query2.callsign.charCodeAt(3) - 65;
    const c3 = query2.callsign.charCodeAt(4) - 65;
    const c4 = query2.callsign.charCodeAt(5) - 65;
    const l1 = query2.locator.charCodeAt(0) - 65;
    const l2 = query2.locator.charCodeAt(1) - 65;
    const l3 = query2.locator.charCodeAt(2) - 48;
    const l4 = query2.locator.charCodeAt(3) - 48;
    const p = pow2dec[query2.power];

    const sum1 = c1 * 26 * 26 * 26 + c2 * 26 * 26 + c3 * 26 + c4;
    const sum2 =
        l1 * 18 * 10 * 10 * 19 + l2 * 10 * 10 * 19 + l3 * 10 * 19 + l4 * 19 + p;

    const lsub1 = Math.floor(sum1 / 25632);
    const lsub2_tmp = sum1 - lsub1 * 25632;
    const lsub2 = Math.floor(lsub2_tmp / 1068);

    const alt = (lsub2_tmp - lsub2 * 1068) * 20;

    const subloc =
        String.fromCharCode(lsub1 + 65) + String.fromCharCode(lsub2 + 65);
    const finalMaidenHead = maidenHead + subloc.toLowerCase();

    console.log("Maidenhead: " + finalMaidenHead);

    const temp_1 = Math.floor(sum2 / 6720);
    const temp_2 = temp_1 * 2 + 457;
    const temp_3 = (temp_2 * 5) / 1024;
    const temp = Math.round((temp_2 * 500) / 1024 - 273);

    console.log("Temperature: " + temp);

    const batt_1 = sum2 - temp_1 * 6720;
    const batt_2 = Math.floor(batt_1 / 168);
    const batt_3 = batt_2 * 10 + 614;
    const batt = (batt_3 * 5) / 1024;

    console.log("Voltage: " + batt);

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

    const upperMaidenHead = finalMaidenHead.toUpperCase();
    const lon =
        -180 +
        (upperMaidenHead.charCodeAt(0) - "A".charCodeAt(0)) * 20 +
        parseInt(upperMaidenHead[2]) * 2 +
        ((upperMaidenHead.charCodeAt(4) - "A".charCodeAt(0)) * 5) / 60 +
        2.5 / 60;
    const lat =
        -90 +
        (upperMaidenHead.charCodeAt(1) - "A".charCodeAt(0)) * 10 +
        parseInt(upperMaidenHead[3]) * 1 +
        ((upperMaidenHead.charCodeAt(5) - "A".charCodeAt(0)) * 2.5) / 60 +
        1.25 / 60;

    console.log("Latitude: " + lat);
    console.log("Longitude: " + lon);
    console.log("Altitude: " + alt);

    if (settings.uploadToAPRS) {
        await uploadToAPRSIS(query1, balloon);
    }

    if (settings.uploadToSondehub) {
        const data: SondehubPayload = {
            software_name: "SQ2CPA wspr2sondechub",
            software_version: "1.0.0",
            modulation: "WSPR",
            comment: balloon.comment,
            detail: balloon.detail,
            device: balloon.device,
            type: balloon.type,
            time_received: "",
            datetime: "",
            payload_callsign: balloon.payload,
            lat,
            lon,
            alt,
            gps,
            batt,
            sats,
            temp,
            uploader_callsign: "",
            frequency: 0.0,
            snr: 0.0,
        };

        date.setHours(date.getHours() + 2);

        data.time_received = date.toISOString();
        data.datetime = data.time_received;

        const receivers = await getReceivers(
            query1.stime,
            query2.stime,
            balloon,
            query2.callsign
        );

        console.log(
            `Got receivers: ${receivers.map((o) => o.callsign).join()}`
        );

        for (const receiver of receivers) {
            data.uploader_callsign = receiver.callsign;
            data.frequency = receiver.frequency / 1000000;
            data.snr = receiver.snr;

            receiver.date.setHours(receiver.date.getHours() + 2);

            data.time_received = receiver.date.toISOString();
            data.datetime = data.time_received;

            await uploadToSondehub([data]);
        }
    }
}

async function decodeZachtek1(
    balloon: Balloon,
    query1: QueryResult,
    query2: QueryResult
) {
    const date = query2.date;

    const power1 = query1.power;
    const power2 = query2.power;

    console.log(`Powers: ${power1} ${power2}`);

    let altitude = 0;

    if ((power1 === 60 && power2 === 60) || balloon.payload === "SQ2CPA-30") {
        console.log(`Got invalid altitude`);
    } else {
        altitude = power1 * 300 + power2 * 20;

        console.log(`Got altitude: ${altitude}`);
    }

    const locator = query2.locator;
    console.log(`Got locator: ${locator}`);

    if (settings.uploadToAPRS) {
        await uploadToAPRSIS(query1, balloon);
    }

    if (settings.uploadToSondehub) {
        const data: SondehubPayload = {
            software_name: "SQ2CPA wspr2sondechub",
            software_version: "1.0.0",
            modulation: "WSPR",
            comment: balloon.comment,
            detail: balloon.detail,
            device: balloon.device,
            type: balloon.type,
            time_received: "2024-01-01",
            datetime: "2024-01-01",
            payload_callsign: balloon.payload,
            lat: query2.latitude,
            lon: query2.longitude,
            alt: altitude,
            uploader_callsign: "",
            frequency: 0.0,
            snr: 0.0,
        };

        date.setHours(date.getHours() + 2);

        data.time_received = date.toISOString();
        data.datetime = data.time_received;

        const receivers = await getReceivers(
            query1.stime,
            query2.stime,
            balloon
        );

        console.log(
            `Got receivers: ${receivers.map((o) => o.callsign).join()}`
        );

        for (const receiver of receivers) {
            data.uploader_callsign = receiver.callsign;
            data.frequency = receiver.frequency / 1000000;
            data.snr = receiver.snr;

            await uploadToSondehub([data]);
        }
    }
}

(async function () {
    for (const balloon of settings.balloons) {
        if (!balloon.active) {
            console.log(`Balloon ${balloon.payload} is unactive, skipping`);
            continue;
        }

        console.log(`Checking balloon: ${balloon.payload}`);

        if (![TYPE_TRAQUITO, TYPE_ZACHTEK].includes(balloon.type)) {
            console.log(`Invalid balloon type: ${balloon.type}`);
            continue;
        }

        if (
            balloon.type === TYPE_TRAQUITO &&
            (!balloon.traquito?.flightID1 || !balloon.traquito?.flightID3)
        ) {
            console.log(`Please provide traquito flight IDs`);
            continue;
        }

        const queryTime = Math.floor(Date.now() / 1000) - 30 * 60;

        const callsignTimeslot =
            "____-__-__ __:_" + balloon.slots.callsign + "%";

        const telemetryTimeslot =
            "____-__-__ __:_" + balloon.slots.telemetry + "%";

        const rawQuery1 = await performQuery(
            `SELECT toString(time) as stime, band, tx_sign, tx_loc, tx_lat, tx_lon, power, stime FROM wspr.rx WHERE (band='${balloon.band}') AND (stime LIKE '${callsignTimeslot}') AND (time > ${queryTime}) AND (tx_sign='${balloon.hamCallsign}') ORDER BY time DESC LIMIT 1`
        );

        let rawQuery2 = "";

        if (balloon.type === TYPE_ZACHTEK) {
            rawQuery2 = await performQuery(
                `SELECT toString(time) as stime, band, tx_sign, tx_loc, tx_lat, tx_lon, power, stime FROM wspr.rx WHERE (band='${balloon.band}') AND (stime LIKE '${telemetryTimeslot}') AND (time > ${queryTime}) AND (tx_sign='${balloon.hamCallsign}') ORDER BY time DESC LIMIT 1`
            );
        } else if (balloon.type === TYPE_TRAQUITO) {
            const flightID =
                balloon.traquito.flightID1 +
                "_" +
                balloon.traquito.flightID3 +
                "%";

            rawQuery2 = await performQuery(
                `SELECT toString(time) as stime, band, tx_sign, tx_loc, tx_lat, tx_lon, power, stime FROM wspr.rx WHERE (band='${balloon.band}') AND (stime LIKE '${telemetryTimeslot}') AND (time > ${queryTime}) AND (tx_sign LIKE '${flightID}') ORDER BY time DESC LIMIT 1`
            );
        }

        if (!rawQuery1.length || !rawQuery2.length) continue;

        console.log(rawQuery1);
        console.log(rawQuery2);

        const query1 = parseQuery(rawQuery1);
        const query2 = parseQuery(rawQuery2);

        const timeDiff = (query2.date.getTime() - query1.date.getTime()) / 1000;

        if (timeDiff !== 120) {
            console.error(`Invalid time diff: ${timeDiff}, skipping`);
            continue;
        }

        if (balloon.type === TYPE_ZACHTEK) {
            await decodeZachtek1(balloon, query1, query2);
        } else if (balloon.type === TYPE_TRAQUITO) {
            await decodeTraquito(balloon, query1, query2);
        }
    }
})();
