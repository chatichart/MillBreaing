import { AppData } from "../models/schema";
import { initialData } from "../domain/initialItems";
export function previewData(): AppData {
  return initialData();
}
