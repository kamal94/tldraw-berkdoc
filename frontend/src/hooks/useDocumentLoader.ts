import { useCallback } from "react";
import { createShapeId, type Editor } from "tldraw";
import sampleData from "../data/sample-documents.json";
import { documentsApi } from "../api/documents";
import type { Contributor } from "../shapes/DocumentShape";
import type { DocumentSource } from "../shapes/SourceIcon";

const USE_DEMO_DATA = false;

const CARD_WIDTH = 300;
const CARD_HEIGHT = 140;
const GAP = 40;
const CARDS_PER_ROW = 3;

// Helper to get contributors from user IDs
function getContributors(contributorIds: string[]): Contributor[] {
  return contributorIds
    .map((id) => {
      const user = (sampleData as { users: { id: string; name: string; avatarUrl: string; color: string }[] }).users.find((u) => u.id === id);
      if (!user) return null;
      return {
        name: user.name,
        avatarUrl: user.avatarUrl,
        color: user.color,
      } as Contributor;
    })
    .filter((c): c is Contributor => c !== null);
}

export function useDocumentLoader(isAuthenticated: boolean, userId?: string) {
  const handleEditorMount = useCallback(
    (editor: Editor) => {
      const totalWidth = CARDS_PER_ROW * CARD_WIDTH + (CARDS_PER_ROW - 1) * GAP;
      const startX = -totalWidth / 2;
      const startY = -200;

      const existingShapes = editor.getCurrentPageShapes();
      const hasDocumentShapes = Array.from(existingShapes).some(
        (s) => s.type === "document"
      );

      const init = async () => {
        if (isAuthenticated && userId) {
          try {
            const documents = await documentsApi.findAll();

            documents.forEach((doc, index) => {
              const shapeId = createShapeId(doc.id);
              if (editor.getShape(shapeId)) return;

              const row = Math.floor(index / CARDS_PER_ROW);
              const col = index % CARDS_PER_ROW;

              editor.createShape({
                id: shapeId,
                type: "document",
                x: startX + col * (CARD_WIDTH + GAP),
                y: startY + row * (CARD_HEIGHT + GAP),
                props: {
                  w: CARD_WIDTH,
                  h: CARD_HEIGHT,
                  title: doc.title,
                  url: doc.url || "",
                  source: doc.source as DocumentSource,
                  contributors: [],
                  dimensions: doc.dimensions || [],
                },
              });
            });
          } catch (error) {
            console.error("Failed to fetch documents:", error);
          }
        } else if (!hasDocumentShapes && USE_DEMO_DATA) {
          sampleData.documents.forEach((doc, index) => {
            const shapeId = createShapeId(doc.id);
            if (editor.getShape(shapeId)) return;

            const row = Math.floor(index / CARDS_PER_ROW);
            const col = index % CARDS_PER_ROW;

            editor.createShape({
              id: shapeId,
              type: "document",
              x: startX + col * (CARD_WIDTH + GAP),
              y: startY + row * (CARD_HEIGHT + GAP),
              props: {
                w: CARD_WIDTH,
                h: CARD_HEIGHT,
                title: doc.title,
                url: doc.url,
                source: doc.source as DocumentSource,
                contributors: getContributors(doc.contributorIds),
                dimensions: doc.dimensions,
              },
            });
          });
        }

        if (!hasDocumentShapes) {
          editor.zoomToFit({ animation: { duration: 0 } });
        }
      };

      init();
    },
    [isAuthenticated, userId]
  );

  return { handleEditorMount };
}

