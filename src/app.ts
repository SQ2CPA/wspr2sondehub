import SondehubApi, { TelemetryPayload } from "./lib/SondehubApi";
import WSPRLiveAPi from "./lib/WSPRLiveApi";
import WSPRNetAPi from "./lib/WSPRNetApi";
import APRSISApi from "./lib/APRSISApi";
import TelemetryParserApi, { Telemetry } from "./lib/TelemetryParserApi";
import { readFile } from "fs/promises";
import Settings from "./interface/Settings";
import {
    DATABASE_WSPRLIVE,
    DATABASE_WSPRNETORG,
    SOFTWARE_NAME,
    SOFTWARE_VERSION,
    TYPE_TRAQUITO,
    TYPE_ZACHTEK,
} from "./consts";
import { QueryResult, Receiver } from "interface/WSPR";

(async function () {
    const settings: Settings = JSON.parse(
        await readFile("./settings.json", "utf-8")
    );

    if (!settings.database) {
        console.info(
            `INFO: Database field in settings is undefined. We will use wspr.live database`
        );

        settings.database == DATABASE_WSPRLIVE;
    }

    if (!settings.queryTime) settings.queryTime = 30;

    const wsprLiveApi = new WSPRLiveAPi();
    const wsprNetApi = new WSPRNetAPi();

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
            console.log(`Please provide traquito flight IDs!`);
            continue;
        }

        if (
            balloon.type === TYPE_TRAQUITO &&
            settings.database === DATABASE_WSPRNETORG
        ) {
            console.log(
                `Traquito payloads are not suppored by ${DATABASE_WSPRNETORG} for now, sorry!`
            );
            continue;
        }

        const queryTime =
            Math.floor(Date.now() / 1000) - settings.queryTime * 60;

        const allSlots = Array.isArray(balloon.slots)
            ? balloon.slots
            : [balloon.slots];

        for (const slots of allSlots) {
            let query1: QueryResult, query2: QueryResult;

            if (settings.database === DATABASE_WSPRLIVE) {
                query1 = await wsprLiveApi.getCallsignSpots(
                    balloon,
                    slots.callsign,
                    queryTime
                );

                query2 = await wsprLiveApi.getTelemetrySpots(
                    balloon,
                    slots.telemetry,
                    queryTime
                );
            } else if (settings.database === DATABASE_WSPRNETORG) {
                query1 = await wsprNetApi.getCallsignSpots(
                    balloon,
                    slots.callsign,
                    queryTime
                );

                query2 = await wsprNetApi.getTelemetrySpots(
                    balloon,
                    slots.telemetry,
                    queryTime
                );
            }

            if (!query1 || !query2) {
                console.log(
                    `No data in last ${settings.queryTime} minutes for slots: ${slots.callsign} ${slots.telemetry}`
                );
                continue;
            }

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

            if (!!balloon.launchDate && false) {
                telemetry.launchDate = balloon.launchDate;

                const timeDifference = Math.abs(
                    new Date().getTime() -
                        new Date(balloon.launchDate).getTime()
                );

                const daysAloft = Math.ceil(
                    timeDifference / (1000 * 60 * 60 * 24)
                );

                telemetry.daysAloft = daysAloft;
            }

            if (
                (Math.floor(telemetry.latitude) === 0 &&
                    Math.floor(telemetry.longitude) === 0) ||
                Math.abs(Math.floor(telemetry.latitude)) === 127 ||
                Math.abs(Math.floor(telemetry.longitude)) === 127
            ) {
                console.error(
                    `Got empty location: ${telemetry.latitude} ${telemetry.longitude}, skipping`
                );
                continue;
            }

            let receivers: Receiver[];

            if (settings.database === DATABASE_WSPRLIVE) {
                receivers = await wsprLiveApi.getReceivers(
                    query1.stime,
                    query2.stime,
                    balloon,
                    query2.callsign
                );
            } else if (settings.database === DATABASE_WSPRNETORG) {
                receivers = await wsprNetApi.getReceivers(
                    query1.stime,
                    query2.stime,
                    balloon
                );
            }

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
                        frequency: receiver.frequency,
                        snr: receiver.snr,
                        days_aloft: telemetry.daysAloft,
                        launch_date: telemetry.launchDate,
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
