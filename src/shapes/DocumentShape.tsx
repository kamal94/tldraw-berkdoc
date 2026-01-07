import { Rectangle2d, ShapeUtil } from "tldraw";
import type { TLBaseShape } from "@tldraw/tlschema";
import type { DocumentSource } from "./SourceIcon";
import { DocumentCard } from "./DocumentCard";

// Contributor type for the shape
export interface Contributor {
  name: string;
  avatarUrl?: string;
  color: string;
}

// Document shape properties
export interface DocumentShapeProps {
  w: number;
  h: number;
  title: string;
  url: string;
  source?: DocumentSource;
  contributors: Contributor[];
  dimensions: string[];
}

// The document shape type
export type DocumentShape = TLBaseShape<"document", DocumentShapeProps>;

// The document shape utility
export class DocumentShapeUtil extends ShapeUtil<DocumentShape> {
  static override type = "document" as const;

  getDefaultProps(): DocumentShapeProps {
    return {
      w: 300,
      h: 140,
      title: "Untitled Document",
      url: "",
      contributors: [],
      dimensions: [],
    };
  }

  override canEdit() {
    return false;
  }

  override getGeometry(shape: DocumentShape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    });
  }

  component(shape: DocumentShape) {
    return <DocumentCard shape={shape} />;
  }

  indicator(shape: DocumentShape) {
    return (
      <rect
        width={shape.props.w}
        height={shape.props.h}
        rx="12"
        ry="12"
      />
    );
  }
}
