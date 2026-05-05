import { type GraphData } from "react-force-graph-2d";
import {
  GraphNode,
  GraphAnon,
  GraphEdge,
  IRI,
  StringLang,
  StringDatatype,
  SimpleDate,
  Time,
  DateTime,
  Decimal,
} from "@millenniumdb/driver";

export type MdbGraphObject =
  | IRI
  | StringLang
  | StringDatatype
  | GraphNode
  | GraphAnon
  | GraphEdge
  | SimpleDate
  | Time
  | DateTime
  | Decimal
  | string
  | number
  | boolean
  | null
  | undefined;

export type GraphVisNodeValue = IRI | GraphNode | GraphAnon;
export type GraphVisEdgeValue = IRI | GraphEdge;

export type GraphVisNode = {
  id: string;
  value: GraphVisNodeValue;
  name: string;
  labels?: string[];
  nodeLabelBox?: NodeLabelBox;
  showNodeLabel?: boolean;
  isHighlighted?: boolean;
};

export type GraphVisEdge = {
  id: string;
  value: GraphVisEdgeValue;
  name: string;
  source: string;
  target: string;
  nodeLabelBox?: NodeLabelBox;
  showNodeLabel?: boolean;
  isHighlighted?: boolean;
};

export type NodeLabelBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type GraphVisData = GraphData<GraphVisNode, GraphVisEdge>;

export type MDBGraphData = GraphVisData;
export type MDBGraphNode = GraphVisNode;
export type MDBGraphLink = GraphVisEdge;
