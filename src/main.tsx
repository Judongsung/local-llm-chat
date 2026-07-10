import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import "./styles/base.css";

const APP_ROOT_ELEMENT_ID = "root";

createRoot(document.getElementById(APP_ROOT_ELEMENT_ID)!).render(<App />);
