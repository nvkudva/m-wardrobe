import { render } from "preact";
import { App } from "./app/App";
import * as router from "./app/router";
import "./styles/base.css";

router.start();
render(<App />, document.getElementById("app")!);
