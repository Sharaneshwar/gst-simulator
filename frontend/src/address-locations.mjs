// Local practice locations: typed residential addresses are never sent to a geocoder.
export const LOCATIONS = [
  ["Maharashtra", "Nashik", "Nashik", "422001", 19.9975, 73.7898],
  ["Maharashtra", "Mumbai", "Mumbai", "400001", 18.9388, 72.8354],
  ["Maharashtra", "Pune", "Pune", "411001", 18.528, 73.874],
  ["Karnataka", "Bengaluru", "Bengaluru Urban", "560001", 12.9766, 77.5993],
  ["Tamil Nadu", "Chennai", "Chennai", "600001", 13.093, 80.287],
  ["Delhi", "New Delhi", "New Delhi", "110001", 28.6328, 77.2197],
  ["Gujarat", "Ahmedabad", "Ahmedabad", "380001", 23.027, 72.588],
  ["Gujarat", "Gandhinagar", "Gandhinagar", "382010", 23.2156, 72.6369],
  ["Uttar Pradesh", "Lucknow", "Lucknow", "226001", 26.85, 80.946],
  ["Rajasthan", "Jaipur", "Jaipur", "302001", 26.919, 75.791],
  [
    "Kerala",
    "Thiruvananthapuram",
    "Thiruvananthapuram",
    "695001",
    8.488,
    76.949,
  ],
  ["Telangana", "Hyderabad", "Hyderabad", "500001", 17.388, 78.473],
  ["West Bengal", "Kolkata", "Kolkata", "700001", 22.572, 88.348],
  ["Andhra Pradesh", "Vijayawada", "NTR", "520001", 16.519, 80.619],
  ["Punjab", "Amritsar", "Amritsar", "143001", 31.634, 74.872],
  ["Haryana", "Gurugram", "Gurugram", "122001", 28.459, 77.026],
  ["Chandigarh", "Chandigarh", "Chandigarh", "160017", 30.739, 76.782],
  ["Madhya Pradesh", "Bhopal", "Bhopal", "462001", 23.258, 77.402],
  ["Bihar", "Patna", "Patna", "800001", 25.612, 85.138],
  ["Odisha", "Bhubaneswar", "Khordha", "751001", 20.267, 85.843],
  ["Assam", "Guwahati", "Kamrup Metropolitan", "781001", 26.182, 91.749],
  ["Chhattisgarh", "Raipur", "Raipur", "492001", 21.244, 81.638],
  ["Jharkhand", "Ranchi", "Ranchi", "834001", 23.344, 85.309],
  ["Goa", "Panaji", "North Goa", "403001", 15.498, 73.827],
  ["Uttarakhand", "Dehradun", "Dehradun", "248001", 30.325, 78.041],
  ["Himachal Pradesh", "Shimla", "Shimla", "171001", 31.105, 77.173],
  ["Jammu and Kashmir", "Srinagar", "Srinagar", "190001", 34.072, 74.839],
  ["Ladakh", "Leh", "Leh", "194101", 34.164, 77.585],
  ["Sikkim", "Gangtok", "Gangtok", "737101", 27.331, 88.613],
  ["Arunachal Pradesh", "Itanagar", "Papum Pare", "791111", 27.084, 93.605],
  ["Nagaland", "Kohima", "Kohima", "797001", 25.675, 94.108],
  ["Manipur", "Imphal", "Imphal West", "795001", 24.817, 93.936],
  ["Mizoram", "Aizawl", "Aizawl", "796001", 23.727, 92.718],
  ["Tripura", "Agartala", "West Tripura", "799001", 23.831, 91.286],
  ["Meghalaya", "Shillong", "East Khasi Hills", "793001", 25.574, 91.883],
  ["Puducherry", "Puducherry", "Puducherry", "605001", 11.934, 79.83],
  [
    "Andaman and Nicobar Islands",
    "Sri Vijaya Puram",
    "South Andaman",
    "744101",
    11.668,
    92.736,
  ],
  ["Lakshadweep", "Kavaratti", "Lakshadweep", "682555", 10.566, 72.642],
  [
    "Dadra and Nagar Haveli and Daman and Diu",
    "Daman",
    "Daman",
    "396210",
    20.397,
    72.833,
  ],
].map(([state, city, district, pincode, latitude, longitude]) => ({
  state,
  city,
  district,
  pincode,
  latitude,
  longitude,
}));
export function coordinates(text) {
  const match =
    /^\s*(-?\d+(?:\.\d+)?)\s*([NS])?\s*,\s*(-?\d+(?:\.\d+)?)\s*([EW])?\s*$/i.exec(
      text,
    );
  if (!match) return null;
  const latitude = match[2]
    ? Math.abs(Number(match[1])) * (match[2].toUpperCase() === "S" ? -1 : 1)
    : Number(match[1]);
  const longitude = match[4]
    ? Math.abs(Number(match[3])) * (match[4].toUpperCase() === "W" ? -1 : 1)
    : Number(match[3]);
  return Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
    ? { latitude, longitude }
    : null;
}
