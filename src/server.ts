import { app } from "./app";
import { env } from "./config/env";
import "./queue/emailWorker";

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server started on port ${env.PORT}`);
});
