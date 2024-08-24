import SondehubApi, { TelemetryPayload } from "./lib/SondehubApi";
import WSPRAPi from "./lib/WSPRApi";
import APRSISApi from "./lib/APRSISApi";
import TelemetryParserApi, { Telemetry } from "./lib/TelemetryParserApi";
import { readFile } from "fs/promises";
import Settings from "./interface/Settings";

const SOFTWARE_NAME = "SQ2CPA wspr2sondehub";
const SOFTWARE_VERSION = "1.0.0";

const TYPE_ZACHTEK = "ZachTek";
const TYPE_TRAQUITO = "Jetpack";

(async function () {
    const settings: Settings = JSON.parse(
        await readFile("./settings.json", "utf-8")
    );

    const wsprApi = new WSPRAPi();
    const sondehubApi = new SondehubApi();
    const aprsisApi = new APRSISApi();
    const telemetryParserApi = new TelemetryParserApi();

    for (const balloon of settings.balloons) {
        if (!balloon.active) {
            console.log(`Balloon ${balloon.payload} is unactive, skipping`);
            continue;
        }

        console.log(
            `Checking balloon: ${balloon.payload} (${balloon.type}) (${
                balloon.band || "any band"
            })`
        );

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

        const allSlots = Array.isArray(balloon.slots)
            ? balloon.slots
            : [balloon.slots];

        for (const slots of allSlots) {
            const callsignTimeslot = "____-__-__ __:_" + slots.callsign + "%";

            const telemetryTimeslot = "____-__-__ __:_" + slots.telemetry + "%";

            const bandWhere = !balloon.band
                ? ""
                : `(band='${balloon.band}') AND `;

            const rawQuery1 = await wsprApi.performQuery(
                `SELECT toString(time) as stime, band, tx_sign, tx_loc, tx_lat, tx_lon, power, stime FROM wspr.rx WHERE ${bandWhere}(stime LIKE '${callsignTimeslot}') AND (time > ${queryTime}) AND (tx_sign='${balloon.hamCallsign}') ORDER BY time DESC LIMIT 1`
            );

            let rawQuery2 = "";

            if (balloon.type === TYPE_ZACHTEK) {
                rawQuery2 = await wsprApi.performQuery(
                    `SELECT toString(time) as stime, band, tx_sign, tx_loc, tx_lat, tx_lon, power, stime FROM wspr.rx WHERE ${bandWhere}(stime LIKE '${telemetryTimeslot}') AND (time > ${queryTime}) AND (tx_sign='${balloon.hamCallsign}') ORDER BY time DESC LIMIT 1`
                );
            } else if (balloon.type === TYPE_TRAQUITO) {
                const flightID =
                    balloon.traquito.flightID1 +
                    "_" +
                    balloon.traquito.flightID3 +
                    "%";

                rawQuery2 = await wsprApi.performQuery(
                    `SELECT toString(time) as stime, band, tx_sign, tx_loc, tx_lat, tx_lon, power, stime FROM wspr.rx WHERE ${bandWhere}(stime LIKE '${telemetryTimeslot}') AND (time > ${queryTime}) AND (tx_sign LIKE '${flightID}') ORDER BY time DESC LIMIT 1`
                );
            }

            if (!rawQuery1.length || !rawQuery2.length) {
                console.log(`No data in last 30 minutes`);
                continue;
            }

            console.log(rawQuery1);
            console.log(rawQuery2);

            const query1 = wsprApi.parseQuery(rawQuery1);
            const query2 = wsprApi.parseQuery(rawQuery2);

            const timeDiff =
                (query2.date.getTime() - query1.date.getTime()) / 1000;

            if (timeDiff !== 120) {
                console.error(`Invalid time diff: ${timeDiff}, skipping`);
                continue;
            }

            let telemetry: Telemetry;

            if (balloon.type === TYPE_ZACHTEK) {
                telemetry = await telemetryParserApi.decodeZachtek1(
                    balloon,
                    query1,
                    query2
                );
            } else if (balloon.type === TYPE_TRAQUITO) {
                telemetry = await telemetryParserApi.decodeTraquito(
                    balloon,
                    query1,
                    query2
                );
            }

            if (
                Math.floor(telemetry.latitude) === 0 &&
                Math.floor(telemetry.longitude) === 0
            ) {
                console.error(
                    `Got empty location: ${telemetry.latitude} ${telemetry.longitude}, skipping`
                );
                continue;
            }

            const receivers = await wsprApi.getReceivers(
                query1.stime,
                query2.stime,
                balloon,
                query2.callsign
            );

            console.log(
                `Got receivers: ${receivers.map((o) => o.callsign).join()}`
            );

            if (settings.uploadToSondehub) {
                for (const receiver of receivers) {
                    const data: TelemetryPayload = {
                        software_name: SOFTWARE_NAME,
                        software_version: SOFTWARE_VERSION,
                        modulation: "WSPR",
                        comment: balloon.comment,
                        detail: balloon.detail,
                        device: balloon.device,
                        type: balloon.type,
                        time_received: telemetry.date,
                        datetime: telemetry.date,
                        payload_callsign: balloon.payload,
                        lat: telemetry.latitude,
                        lon: telemetry.longitude,
                        alt: telemetry.altitude,
                        sats: telemetry.sats,
                        vel_h: telemetry.velocityHorizontal,
                        batt: telemetry.voltage,
                        temp: telemetry.temperature,
                        gps: telemetry.gps,
                        uploader_callsign: receiver.callsign,
                        frequency: receiver.frequency / 1000000,
                        snr: receiver.snr,
                    };

                    await sondehubApi.uploadTelemetry([data]);

                    // DO NOT USE FOR NOW!!!
                    // const { latitude, longitude } = UtilsApi.getLocationFromLocator(
                    //     receiver.locator
                    // );

                    // await sondehubApi.uploadListener({
                    //     mobile: false,
                    //     software_name:
                    //         receiver.comment.trim() || "No receiver info",
                    //     software_version: "1.0.0",
                    //     uploader_position: [latitude, longitude, 0],
                    //     uploader_callsign: receiver.callsign,
                    // });
                }
            }

            if (settings.uploadToAPRS) {
                await aprsisApi.upload(
                    telemetry,
                    balloon,
                    receivers.slice(0, 5)
                );
            }

            break;
        }
    }
})();
