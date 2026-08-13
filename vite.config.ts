import { defineConfig } from "vite";

export default defineConfig({
  // base relatif supaya build ini jalan baik di root domain maupun di subpath
  // (misal https://username.github.io/nama-repo/)
  base: "./",
});
