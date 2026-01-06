import { HTMLContainer, Rectangle2d, ShapeUtil } from "tldraw";
import type { TLBaseShape } from "@tldraw/tlschema";
import { useState } from "react";
import { SourceIcon, ExternalLinkIcon } from "./SourceIcon";
import type { DocumentSource } from "./SourceIcon";

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

// Number of tags to show before collapsing
const VISIBLE_TAGS_COUNT = 2;

// Tag pill component
function TagPill({ tag }: { tag: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        backgroundColor: "rgba(99, 102, 241, 0.12)",
        color: "#4F46E5",
        borderRadius: "12px",
        fontSize: "11px",
        fontWeight: 500,
        whiteSpace: "nowrap",
        border: "1px solid rgba(99, 102, 241, 0.2)",
      }}
    >
      {tag}
    </span>
  );
}

// More tags badge with hover tooltip
function MoreTagsBadge({
  count,
  allTags,
}: {
  count: number;
  allTags: string[];
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <span
      style={{ position: "relative", display: "inline-block", pointerEvents: "all" }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span
        style={{
          display: "inline-block",
          padding: "2px 8px",
          backgroundColor: "rgba(107, 114, 128, 0.12)",
          color: "#6B7280",
          borderRadius: "12px",
          fontSize: "11px",
          fontWeight: 500,
          cursor: "pointer",
          border: "1px solid rgba(107, 114, 128, 0.2)",
        }}
      >
        +{count} more
      </span>

      {/* Tooltip */}
      {showTooltip && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "#1F2937",
            color: "#F9FAFB",
            padding: "10px 12px",
            borderRadius: "8px",
            fontSize: "11px",
            boxShadow: "0 10px 25px rgba(0,0,0,0.25)",
            zIndex: 1000,
            minWidth: "180px",
            maxWidth: "280px",
          }}
        >
          <div
            style={{
              fontWeight: 600,
              marginBottom: "6px",
              color: "#9CA3AF",
              fontSize: "10px",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            All Dimensions
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
            {allTags.map((tag) => (
              <span
                key={tag}
                style={{
                  display: "inline-block",
                  padding: "2px 6px",
                  backgroundColor: "rgba(99, 102, 241, 0.25)",
                  color: "#A5B4FC",
                  borderRadius: "8px",
                  fontSize: "10px",
                }}
              >
                {tag}
              </span>
            ))}
          </div>
          {/* Tooltip arrow */}
          <div
            style={{
              position: "absolute",
              bottom: "-6px",
              left: "50%",
              transform: "translateX(-50%)",
              width: 0,
              height: 0,
              borderLeft: "6px solid transparent",
              borderRight: "6px solid transparent",
              borderTop: "6px solid #1F2937",
            }}
          />
        </div>
      )}
    </span>
  );
}

// Contributor avatar component
function ContributorAvatar({
  contributor,
  index,
}: {
  contributor: Contributor;
  index: number;
}) {
  const initials = contributor.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div
      style={{
        width: "26px",
        height: "26px",
        borderRadius: "50%",
        backgroundColor: contributor.color,
        border: "2px solid white",
        marginLeft: index > 0 ? "-8px" : "0",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
        position: "relative",
        zIndex: 10 - index,
      }}
      title={contributor.name}
    >
      {contributor.avatarUrl ? (
        <img
          src={contributor.avatarUrl}
          alt={contributor.name}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
          onError={(e) => {
            // Fallback to initials if image fails to load
            e.currentTarget.style.display = "none";
          }}
        />
      ) : (
        <span
          style={{
            color: "white",
            fontSize: "10px",
            fontWeight: 600,
          }}
        >
          {initials}
        </span>
      )}
    </div>
  );
}

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

  override canEdit(_shape: DocumentShape) {
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
    const { w, h, title, url, source, contributors, dimensions } = shape.props;

    const visibleTags = dimensions.slice(0, VISIBLE_TAGS_COUNT);
    const hiddenTagsCount = dimensions.length - VISIBLE_TAGS_COUNT;

    const handleOpenUrl = (e: React.MouseEvent | React.PointerEvent) => {
      e.stopPropagation();
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    };

    return (
      <HTMLContainer style={{ pointerEvents: "all" }}>
        <div
          style={{
            width: w,
            height: h,
            backgroundColor: "#FFFFFF",
            borderRadius: "12px",
            boxShadow:
              "0 1px 3px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.05)",
            border: "1px solid rgba(0,0,0,0.06)",
            display: "flex",
            flexDirection: "column",
            padding: "14px 16px",
            fontFamily:
              'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            boxSizing: "border-box",
          }}
        >
          {/* Header with title and external link */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: "8px",
              marginBottom: "12px",
            }}
          >
            <div
              style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0 }}
            >
              <span style={{ color: "#6B7280", flexShrink: 0, display: "flex", alignItems: "center" }}>
                <SourceIcon source={source} />
              </span>
              <span
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#111827",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={title}
              >
                {title}
              </span>
            </div>

            {url && (
              <button
                onPointerDown={handleOpenUrl}
                style={{
                  background: "none",
                  border: "none",
                  padding: "4px",
                  cursor: "pointer",
                  color: "#9CA3AF",
                  borderRadius: "4px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "color 0.15s, background-color 0.15s",
                  flexShrink: 0,
                  pointerEvents: "all",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "#4F46E5";
                  e.currentTarget.style.backgroundColor = "rgba(79, 70, 229, 0.08)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "#9CA3AF";
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
                title="Open document"
              >
                <ExternalLinkIcon />
              </button>
            )}
          </div>

          {/* Tags section */}
          {dimensions.length > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "6px",
                marginBottom: "auto",
              }}
            >
              {visibleTags.map((tag) => (
                <TagPill key={tag} tag={tag} />
              ))}
              {hiddenTagsCount > 0 && (
                <MoreTagsBadge count={hiddenTagsCount} allTags={dimensions} />
              )}
            </div>
          )}

          {/* Contributors section */}
          {contributors.length > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                marginTop: "12px",
              }}
            >
              {contributors.map((contributor, index) => (
                <ContributorAvatar
                  key={contributor.name}
                  contributor={contributor}
                  index={index}
                />
              ))}
            </div>
          )}
        </div>
      </HTMLContainer>
    );
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
