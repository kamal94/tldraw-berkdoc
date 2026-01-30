import { HTMLContainer, Rectangle2d, ShapeUtil } from "tldraw";
import type { TLBaseShape } from "@tldraw/tlschema";
import type { CollectionShapeProps } from "@shared/document-shape.types";
import { CollectionBackground } from "./CollectionBackground";
import { CollectionDropIndicator } from "../components/CollectionDropIndicator";

export type CollectionShape = TLBaseShape<"collection", CollectionShapeProps>;

export class CollectionShapeUtil extends ShapeUtil<CollectionShape> {
  static override type = "collection" as const;

  getDefaultProps(): CollectionShapeProps {
    return {
      w: 600,
      h: 400,
      label: "New Collection",
      documentIds: [],
    };
  }

  override canEdit() {
    return false;
  }

  override canResize() {
    return false;
  }

  override hideResizeHandles() {
    return true;
  }

  override getGeometry(shape: CollectionShape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    });
  }

  component(shape: CollectionShape) {
    return (
      <HTMLContainer className="pointer-events-none">
        <div
          className="relative"
          style={{ width: shape.props.w, height: shape.props.h }}
        >
          <CollectionBackground width={shape.props.w} height={shape.props.h} />
          <CollectionDropIndicator collectionId={shape.id} />
        </div>
      </HTMLContainer>
    );
  }

  indicator(shape: CollectionShape) {
    return (
      <rect
        width={shape.props.w}
        height={shape.props.h}
        rx="16"
        ry="16"
      />
    );
  }
}
