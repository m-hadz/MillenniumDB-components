import { IRI, Record as MdbRecord, Session } from "@millenniumdb/driver";
import { formatGraphValue, getGraphValueId } from "./node-id-utils";
import type { GraphVisEdgeValue, GraphVisNodeValue } from "../types/graph";

export type NameAndLabels = {
  name: string;
  labels: string[];
};

export const getNameAndLabelsFromRecords = (
  node: GraphVisNodeValue,
  records: MdbRecord[],
  namePredicates: string[],
  labelsPredicate: string,
  prefixes: Record<string, string> = {},
  varKeys: Partial<{ predicate: string; object: string }> = {}
): NameAndLabels => {
  const {
    predicate: predKey = "p",
    object: objKey = "o",
  } = varKeys;

  if (records.length === 0) {
    return {
      name: formatGraphValue(node, prefixes),
      labels: [],
    };
  }

  const firstByPredicate = new Map<string, string>();
  const labels: string[] = [];
  const stripBrackets = (s: string) => s.startsWith("<") && s.endsWith(">") ? s.slice(1, -1) : s;
  const normalizedLabelsPredicate = stripBrackets(labelsPredicate ?? "");

  for (const record of records) {
    const predStr = record.get(predKey).toString();
    const objStr = record.get(objKey).toString();
    if (!firstByPredicate.has(predStr)) {
      firstByPredicate.set(predStr, objStr);
    }
    if (predStr === normalizedLabelsPredicate) {
      labels.push(objStr);
    }
  }

  let name = formatGraphValue(node, prefixes);
  for (const predicate of namePredicates) {
    const newName = firstByPredicate.get(stripBrackets(predicate));
    if (newName != null && newName !== "") {
      name = newName;
      break;
    }
  }
  return { name, labels };
};

export const getNameAndLabels = async (
  session: Session,
  nodeValue: GraphVisNodeValue,
  namePredicates: string[],
  labelsPredicate: string,
  prefixes: Record<string, string> = {}
): Promise<NameAndLabels> => {
  const query = `SELECT ?p ?o WHERE { ?node ?p ?o . }`;
  const result = session.run(query, { node: nodeValue });
  const records = await result.records();

  return getNameAndLabelsFromRecords(nodeValue, records, namePredicates, labelsPredicate, prefixes);
};

export const getNodesNamesAndLabels = async (
  session: Session,
  nodeValues: GraphVisNodeValue[],
  namePredicates: string[],
  labelsPredicate: string,
  prefixes: Record<string, string> = {}
): Promise<Map<string, NameAndLabels>> => {
  const iriValues = nodeValues.map((iri) => `<${iri}>`).join(" ");
  const query = `
    SELECT ?subject ?p ?o
    WHERE {
      VALUES ?subject { ${iriValues} }
      ?subject ?p ?o .
    }
  `;
  const result = session.run(query);
  const records = await result.records();

  const byIri = new Map<string, any[]>();
  for (const record of records) {
    const subject = record.get("subject").toString();
    if (!byIri.has(subject)) {
      byIri.set(subject, []);
    }
    byIri.get(subject)!.push(record);
  }

  const resultMap = new Map<string, NameAndLabels>();
  for (const node of nodeValues) {
    const iriRecords = byIri.get(node.toString()) || [];
    const { name, labels } = getNameAndLabelsFromRecords(node, iriRecords, namePredicates, labelsPredicate, prefixes);
    resultMap.set(getGraphValueId(node), { name, labels });
  }

  return resultMap;
}

export type NodeDescription = {
  nodeValue: GraphVisNodeValue;
  name: string;
  type: string;
  labels: string[];
  literals: Record<string, any>;
};

export const getNodeDescription = async (
  session: Session,
  nodeValue: GraphVisNodeValue,
  namePredicates: string[],
  labelsPredicate: string,
  prefixMap: Record<string, string> = {}
): Promise<NodeDescription | null> => {
  const query = `SELECT ?p ?o WHERE { ?node ?p ?o . }`;
  const result = session.run(query, { node: nodeValue });
  const records = await result.records();

  const literals = records.reduce((acc: Record<string, any>, record: MdbRecord) => {
    const predicate = formatGraphValue(record.get("p"), prefixMap);
    const object = record.get("o");
    if (object instanceof IRI) {
      return acc;
    }
    acc[predicate] = object.toString();
    return acc;
  }, {});

  const { name, labels } = getNameAndLabelsFromRecords(nodeValue, records, namePredicates, labelsPredicate, prefixMap);
  return { nodeValue, name, type: "IRI", labels, literals };
};

export type LinkAndNeighbor = {
  neighborId: string;
  neighborValue: GraphVisNodeValue;
  neighborLabels: string[];
  neighborName: string;
  edgeId: string;
  edgeValue: GraphVisEdgeValue;
  edgeName: string;
};

export const getLinksAndNeighbors = async (
  session: Session,
  nodeValue: GraphVisNodeValue,
  namePredicates: string[],
  labelsPredicate: string,
  prefixes: Record<string, string> = {},
  outgoing: boolean,
): Promise<LinkAndNeighbor[]> => {
  // TODO: Handle blank nodes?
  const nodeId = getGraphValueId(nodeValue);
  let query;
  if (outgoing) {
    query = `
      SELECT ?predicate ?neighbor ?neighborPredicate ?neighborObject
      WHERE {
        ?node ?predicate ?neighbor .
        FILTER(isIRI(?neighbor))
        OPTIONAL {
          ?neighbor ?neighborPredicate ?neighborObject .
        }
      }
    `;
  } else {
    query = `
      SELECT ?predicate ?neighbor ?neighborPredicate ?neighborObject
      WHERE {
        ?neighbor ?predicate ?node .
        OPTIONAL {
          ?neighbor ?neighborPredicate ?neighborObject .
        }
      }
    `;
  }

  const result = session.run(query, { node: nodeValue });
  const records = await result.records();

  const byNeighbor = new Map<string, MdbRecord[]>();
  for (const record of records) {
    const neighborId = getGraphValueId(record.get("neighbor"));
    if (!byNeighbor.has(neighborId)){
      byNeighbor.set(neighborId, []);
    }
    byNeighbor.get(neighborId)!.push(record);
  }

  const linksAndNeighbors: LinkAndNeighbor[] = [];
  for (const [neighborId, records] of byNeighbor.entries()) {
    const firstRecord = records[0];
    
    const neighborValue = firstRecord.get("neighbor");
    const edgeValue = firstRecord.get("predicate");
    const edgeId = `${outgoing ? nodeId : neighborId}-${getGraphValueId(edgeValue)}-${outgoing ? neighborId : nodeId}`;
    const edgeName = formatGraphValue(edgeValue, prefixes);

    let neighborName = formatGraphValue(neighborValue, prefixes);
    let neighborLabels: string[] = [];

    if (firstRecord.get("neighborObject") != null) {
      const { name, labels } = getNameAndLabelsFromRecords(
        neighborValue,
        records,
        namePredicates,
        labelsPredicate,
        prefixes,
        { predicate: "neighborPredicate", object: "neighborObject" }
      );
      neighborName = name;
      neighborLabels = labels;
    }

    linksAndNeighbors.push({
      neighborId,
      neighborValue,
      neighborLabels,
      neighborName,
      edgeId,
      edgeValue,
      edgeName,
    });
  }

  return linksAndNeighbors;
};

export type TextSearchItem = {
  category: string;
  nodeValue: GraphVisNodeValue;
  result: string | undefined;
};

export const textSearchNodes = async (
  session: Session, searchText: string, searchPredicates: string[], limit: number = 50
): Promise<TextSearchItem[]> => {
  const stripBrackets = (s: string) => s.startsWith("<") && s.endsWith(">") ? s.slice(1, -1) : s;
  const valuesStatement = `VALUES ?predicate { ${searchPredicates.map(iri => `<${stripBrackets(iri)}>`).join(" ")} }`;
  const query = `
    SELECT ?subject ?predicate ?object
    WHERE {
      {
        ${valuesStatement}
        ?subject ?predicate ?object .
        FILTER(REGEX(STR(?object), ?objectValueRegex, "i"))
      }
      UNION
      {
        {
          SELECT DISTINCT ?subject
          WHERE {
            ?subject ?p ?o .
            FILTER(REGEX(STR(?subject), ?subjectIriRegex, "i"))
          }
        }
        BIND("IRI" AS ?predicate)
      }
    }
    LIMIT ${limit}
  `;

  const objectValueRegex = `(^|\\s)${searchText}`;
  const subjectIriRegex = searchText;

  const result = session.run(query, { objectValueRegex, subjectIriRegex });
  const records = await result.records();

  return records.map((record: MdbRecord) => {
    const nodeValue = record.get("subject");
    const nodeId = getGraphValueId(nodeValue);
    const result = record.get("object")?.toString();
    const category = record.get("predicate").toString();

    return {
      category,
      nodeValue,
      nodeId,
      result,
    };
  });
};
