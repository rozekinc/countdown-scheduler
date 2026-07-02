import "./styles.css";
import { init } from "./ui";

function bootstrap(): void {
  const root = document.getElementById("app");
  if (!root) {
    throw new Error('Missing #app root element in admin/index.html.');
  }
  init(root);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}
