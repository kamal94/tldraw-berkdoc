import {
  HTMLContainer,
  BaseBoxShapeUtil,
  T,
  DefaultColorStyle,
  DefaultDashStyle,
  useDefaultColorTheme,
} from "tldraw";
import type { TLBaseShape } from "@tldraw/tlschema";
import type { CollectionShapeProps } from "@shared/document-shape.types";
import { COLLECTION_SHAPE_DEFAULTS } from "@shared/shape-schemas";
import { CollectionBackground } from "./CollectionBackground";
import { CollectionDropIndicator } from "../components/CollectionDropIndicator";

export type CollectionShape = TLBaseShape<"collection", CollectionShapeProps>;

export function CollectionShapeComponent({ shape }: { shape: CollectionShape }) {
  const theme = useDefaultColorTheme();

  return (
    <HTMLContainer className="pointer-events-none">
      <div
        className="relative"
        style={{ width: shape.props.w, height: shape.props.h }}
      >
        <CollectionBackground
          width={shape.props.w}
          height={shape.props.h}
          color={shape.props.color}
          dash={shape.props.dash}
          theme={theme}
        />
        <CollectionDropIndicator collectionId={shape.id} />
      </div>
    </HTMLContainer>
  );
}

export class CollectionShapeUtil extends BaseBoxShapeUtil<CollectionShape> {
  static override type = "collection" as const;

  // Static props with style validators - enables StylePanel integration
  static override props = {
    w: T.number,
    h: T.number,
    label: T.string,
    documentIds: T.arrayOf(T.string),
    color: DefaultColorStyle,
    dash: DefaultDashStyle,
  };

  getDefaultProps(): CollectionShapeProps {
    return { ...COLLECTION_SHAPE_DEFAULTS };
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

  component(shape: CollectionShape) {
    return (
      <CollectionShapeComponent shape={shape} />
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
