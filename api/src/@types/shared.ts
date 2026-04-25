export type RequestParams = {
  id: string;
};

export type APIResponse<Data> = {
  total: number;
  items: Data[];
};

export type QueryFilters<SortFields> = {
  page?: number;
  limit?: 20 | 40 | 60;
  sortType?: 'asc' | 'desc';
  sortField?: SortFields;
  search?: string;
};
