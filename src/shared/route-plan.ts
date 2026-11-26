export type Point = [number, number]; // longitude, latitude
export type Depot = { id: string; name: string; address: string; longitude: number; latitude: number };
export interface RoadMap {
  addresses: string[];
  pins: Point[];
  line: Point[];
  meters: number;
  legSeconds?: number[];
  depot?: Depot | null;
  returnToDepot?: boolean;
  revision?: string;
}
