import { createApp } from "./app.js";
import { validateEnvironment } from "./config/env.js";

const environment = validateEnvironment();
const app = createApp();
app.listen(environment.API_PORT, () => console.info(`API listening on port ${environment.API_PORT}`));
