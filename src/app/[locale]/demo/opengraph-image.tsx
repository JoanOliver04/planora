import { ImageResponse } from "next/og";
export const alt = "Try the interactive Planora demo";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function Image() { return new ImageResponse(<div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#233522", background: "#f2eadc", fontFamily: "sans-serif" }}><div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}><div style={{ fontSize: 44 }}>Interactive demo</div><div style={{ fontSize: 90, fontWeight: 750, marginTop: 16 }}>Plan your week</div><div style={{ fontSize: 30, marginTop: 24 }}>No account required · Data stays in your browser</div></div></div>, size); }
