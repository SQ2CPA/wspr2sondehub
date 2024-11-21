import Balloon from "./Balloon";

export default interface Settings {
    uploadToSondehub: boolean;
    uploadToAPRS: boolean;
    balloons: Balloon[];
    database: string;
    queryTime: number;
}
