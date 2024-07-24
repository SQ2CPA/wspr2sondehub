export default class UtilsApi {
    static getLocationFromLocator(upperMaidenHead: string): {
        latitude: number;
        longitude: number;
    } {
        upperMaidenHead = upperMaidenHead.toUpperCase();

        const longitude =
            -180 +
            (upperMaidenHead.charCodeAt(0) - "A".charCodeAt(0)) * 20 +
            parseInt(upperMaidenHead[2]) * 2 +
            ((upperMaidenHead.charCodeAt(4) - "A".charCodeAt(0)) * 5) / 60 +
            2.5 / 60;
        const latitude =
            -90 +
            (upperMaidenHead.charCodeAt(1) - "A".charCodeAt(0)) * 10 +
            parseInt(upperMaidenHead[3]) * 1 +
            ((upperMaidenHead.charCodeAt(5) - "A".charCodeAt(0)) * 2.5) / 60 +
            1.25 / 60;

        return { longitude, latitude };
    }
}
