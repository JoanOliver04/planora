import { ImageResponse } from "next/og";
export const alt = "Planora — Your day, in harmony";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function Image() { return new ImageResponse(<div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 90, color: "#f7f8f4", background: "linear-gradient(135deg,#182417,#52734d)", fontFamily: "sans-serif" }}><div style={{ fontSize: 82, fontWeight: 700 }}>Planora</div><div style={{ fontSize: 38, marginTop: 24 }}>Tasks, habits and events in harmony.</div></div>, size); }
