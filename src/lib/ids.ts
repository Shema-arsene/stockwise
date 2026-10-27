import { v7 as uuidv7 } from "uuid";

/** Time-ordered UUID, generated on the device so records keep their id when synced. */
export const newId = () => uuidv7();
