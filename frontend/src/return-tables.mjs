export const TABLES_3B = [
  ["3.1", "Tax on outward and reverse charge inward supplies"],
  ["3.1.1", "Supplies notified under section 9(5)"],
  ["3.2", "Inter-state supplies"],
  ["4", "Eligible ITC"],
  ["5", "Exempt, nil and Non-GST inward supplies"],
  ["5.1", "Interest and Late fee"],
];
export const ROWS_3B = {
  3.1: [
    [
      "a",
      "(a) Outward taxable supplies (other than zero rated, nil rated and exempted)",
    ],
    ["b", "(b) Outward taxable supplies (zero rated)"],
    ["c", "(c) Other outward supplies (Nil rated, exempted)"],
    ["d", "(d) Inward supplies (liable to reverse charge)"],
    ["e", "(e) Non-GST outward supplies"],
  ],
  "3.1.1": [
    [
      "a",
      "(i) Taxable supplies on which electronic commerce operator pays tax u/s 9(5)",
    ],
    [
      "b",
      "(ii) Taxable supplies made by registered person through electronic commerce operator",
    ],
  ],
  3.2: [
    ["unregistered", "Supplies made to Unregistered Persons"],
    ["composition", "Supplies made to Composition Taxable Persons"],
    ["uin", "Supplies made to UIN holders"],
  ],
  4: [
    ["a1", "(A)(1) Import of goods"],
    ["a2", "(A)(2) Import of services"],
    ["a3", "(A)(3) Inward supplies liable to reverse charge"],
    ["a4", "(A)(4) Inward supplies from ISD"],
    ["a5", "(A)(5) All other ITC"],
    ["b1", "(B)(1) ITC Reversed — Rules 38, 42, 43 and section 17(5)"],
    ["b2", "(B)(2) ITC Reversed — Others"],
    ["c", "(C) Net ITC Available (A) − (B)"],
    ["d1", "(D)(1) ITC reclaimed which was reversed earlier"],
    ["d2", "(D)(2) Ineligible ITC under section 16(4) and POS restrictions"],
  ],
  5: [
    [
      "exempt",
      "From a supplier under composition scheme, exempt and nil rated supply",
    ],
    ["nongst", "Non-GST supply"],
  ],
  5.1: [
    ["interest", "Interest"],
    ["latefee", "Late Fee"],
  ],
};
