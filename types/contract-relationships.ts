export interface RelationshipNode {
  id: string;
  recordNumber: string;
  title: string;
  contractType: string;
  stage: string;
  contractStatus: string;
  amountNumeric: number | null;
  counterpartyName: string | null;
  createdAt: string;
  isCurrent: boolean;
}

export interface RelationshipTreeResponse {
  hasRelationships: boolean;
  currentContract: {
    id: string;
    recordNumber: string;
    title: string;
    contractType: string;
    stage: string;
    contractStatus: string;
    amountNumeric: number | null;
    counterpartyName: string | null;
  };
  grandparent: RelationshipNode | null;
  parent: RelationshipNode | null;
  siblings: RelationshipNode[];
  children: RelationshipNode[];
  grandchildren: Record<string, RelationshipNode[]>;
}
