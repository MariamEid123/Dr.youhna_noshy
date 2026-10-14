export default {plugins:[(await import("@vitejs/plugin-react")).default()],server:{proxy:{"/api":"http://localhost:5000"}}}
