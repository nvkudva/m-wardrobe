import { Drawer } from "../components/Drawer";
import { Header } from "../components/Header";
import { Sheet } from "../components/Sheet";
import { WardrobePage } from "../pages/WardrobePage";
import * as store from "./store";

// The phone frame and its screen: header, the wardrobe underneath, then the
// menu and routed pages sliding over it.
export function App() {
  return (
    <div id="device">
      <div id="screen" data-mode={store.detail.value ? "pdp" : "rack"}>
        <Header />
        <WardrobePage />
        <Drawer />
        <Sheet />
      </div>
    </div>
  );
}
