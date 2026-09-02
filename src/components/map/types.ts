export type PermitRecord = {
  id: string;
  coords: [number, number];
  latLng: google.maps.LatLngLiteral;
  record: string | null;
  address: string | null;
  status: string | null;
  date: string | null;
  /** `date` parsed to a UTC epoch ms, computed once at normalize time. */
  dateMs: number | null;
  description: string | null;
  owner: string | null;
  tree_dbh: string | null;
  tree_location: string | null;
  reason_removal: string | null;
  tree_description: string | null;
  tree_number: string | null;
  species: string | null;
};

export type WeekRange = {
  key: string;
  start: Date;
  end: Date;
};

export type WeekOption = {
  value: string;
  label: string;
  week: WeekRange;
};
