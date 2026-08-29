export const MEDIA_CREDIT_PACKS = {
  small: {
    id: "small",
    name: "GEANOS Photo Credits - 10 Credit Pack",
    credits: 10,
    price: "9.00",
    savings: "1.00",
    currencyCode: "USD",
  },
  standard: {
    id: "standard",
    name: "GEANOS Photo Credits - 25 Credit Pack",
    credits: 25,
    price: "20.00",
    savings: "5.00",
    currencyCode: "USD",
  },
  value: {
    id: "value",
    name: "GEANOS Photo Credits - 50 Credit Pack",
    credits: 50,
    price: "38.00",
    savings: "12.00",
    currencyCode: "USD",
  },
};

export function getMediaCreditPack(packId) {
  return MEDIA_CREDIT_PACKS[packId] || null;
}

export function getMediaCreditPackByName(packName) {
  return (
    Object.values(MEDIA_CREDIT_PACKS).find(
      (pack) => pack.name === packName,
    ) || null
  );
}