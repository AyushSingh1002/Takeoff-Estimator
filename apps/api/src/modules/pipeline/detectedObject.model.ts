import { model, Schema, type Document } from 'mongoose';

export const DETECTED_OBJECT_CLASSES = [
  'wall',
  'door',
  'window',
  'room',
  'slab',
  'column',
  'other',
] as const;
export type DetectedObjectClass = (typeof DETECTED_OBJECT_CLASSES)[number];

export type DetectedObjectGeometryKind = 'Point' | 'LineString' | 'Polygon';

export interface DetectedObjectGeometry {
  kind: DetectedObjectGeometryKind;
  coordinates: number[][];
}

export interface DetectedObjectAttrs {
  projectId: string;
  jobId: string;
  sheetId?: string;
  class: DetectedObjectClass;
  geometry: DetectedObjectGeometry;
  confidence?: number;
}

const DetectedObjectSchema = new Schema<DetectedObjectAttrs & Document>(
  {
    projectId: { type: String, required: true },
    jobId: { type: String, required: true },
    sheetId: { type: String, trim: true },
    class: { type: String, enum: DETECTED_OBJECT_CLASSES, required: true },
    geometry: {
      kind: { type: String, enum: ['Point', 'LineString', 'Polygon'], required: true },
      coordinates: { type: Schema.Types.Mixed, required: true },
    },
    confidence: { type: Number },
  },
  { timestamps: true },
);

export const DetectedObject = model<DetectedObjectAttrs & Document>(
  'DetectedObject',
  DetectedObjectSchema,
);
