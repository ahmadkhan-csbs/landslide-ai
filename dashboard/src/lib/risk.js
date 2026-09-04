export const RAINFALL = { 1: 10, 2: 15, 3: 30, 4: 50, 5: 120, 6: 320, 7: 380, 8: 340, 9: 250, 10: 120, 11: 20, 12: 12 };

export const cities = [
  ["Guwahati, Assam", 26.14, 91.73], ["Shillong, Meghalaya", 25.57, 91.88],
  ["Imphal, Manipur", 24.81, 93.94], ["Kohima, Nagaland", 25.67, 94.11],
  ["Aizawl, Mizoram", 23.73, 92.72], ["Agartala, Tripura", 23.83, 91.28],
  ["Itanagar, Arunachal", 27.08, 93.61], ["Gangtok, Sikkim", 27.33, 88.61],
];

export function prediction(lat, lon, month) {
  const rainfall = RAINFALL[month] ?? 50;
  const terrain = 1 / (1 + Math.abs(lat - 25.5) + Math.abs(lon - 93));
  // Deterministic JavaScript risk estimator based on the original model's inputs.
  const monsoon = rainfall / 380;
  const location = Math.max(0, 1 - (Math.abs(lat - 25.5) / 7 + Math.abs(lon - 93) / 9.5) / 2);
  const probability = Math.min(100, Math.max(1, (0.57 * monsoon + 0.23 * terrain + 0.2 * location) * 100));
  const risk = probability > 60 ? "HIGH" : probability > 30 ? "MEDIUM" : "LOW";
  return { location: { lat, lon }, month, risk_probability: Number(probability.toFixed(1)), risk_level: risk, color: risk === "HIGH" ? "red" : risk === "MEDIUM" ? "orange" : "green", factors: { rainfall_mm: rainfall, main_reason: [6, 7, 8, 9].includes(month) ? "Heavy monsoon rainfall + fragile terrain" : "Dry season - low rainfall" } };
}
