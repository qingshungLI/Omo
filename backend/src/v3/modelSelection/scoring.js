export function scoreAgainstAnnotation(output, annotation = {}) {
  if (!output || typeof output !== "object") {
    return emptyScore();
  }

  const memoryItem = output.memoryItem;
  const question = output.question;
  const acceptedStatements = arrayOfStrings(annotation.acceptedMemoryStatements);
  const acceptedAnswers = arrayOfStrings(annotation.acceptedAnswers);
  const acceptedTypes = arrayOfStrings(annotation.acceptableContentTypes);
  const acceptedQuestionTypes = arrayOfStrings(annotation.acceptableQuestionTypes);
  const expectedEvidence = new Set(arrayOfStrings(annotation.evidenceRegionIds));
  const actualEvidence = new Set(memoryItem?.evidenceRegionIds || []);

  const memorySimilarity = memoryItem
    ? maximumSimilarity(memoryItem.statement, acceptedStatements)
    : annotation.disposition === output.disposition ? 1 : 0;

  return {
    dispositionMatch: annotation.disposition ? Number(annotation.disposition === output.disposition) : null,
    memorySimilarity,
    memoryAutoAccepted: acceptedStatements.length ? Number(memorySimilarity >= 0.72) : null,
    contentTypeMatch: acceptedTypes.length ? Number(acceptedTypes.includes(output.contentType)) : null,
    riskDomainMatch: annotation.riskDomain ? Number(annotation.riskDomain === output.riskDomain) : null,
    retentionIntentMatch: annotation.retentionIntent && memoryItem
      ? Number(annotation.retentionIntent === memoryItem.retentionIntent)
      : null,
    questionTypeMatch: acceptedQuestionTypes.length && question
      ? Number(acceptedQuestionTypes.includes(question.type))
      : null,
    answerMatch: acceptedAnswers.length && question
      ? Number(maximumSimilarity(question.answer, acceptedAnswers) >= 0.92)
      : null,
    evidencePrecision: setPrecision(actualEvidence, expectedEvidence),
    evidenceRecall: setRecall(actualEvidence, expectedEvidence)
  };
}

export function textSimilarity(left, right) {
  const a = normalizeText(left);
  const b = normalizeText(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) {
    return Math.min(a.length, b.length) / Math.max(a.length, b.length);
  }
  const leftBigrams = ngrams(a, 2);
  const rightBigrams = ngrams(b, 2);
  const intersection = [...leftBigrams].filter((item) => rightBigrams.has(item)).length;
  const union = new Set([...leftBigrams, ...rightBigrams]).size;
  return union ? intersection / union : 0;
}

function maximumSimilarity(value, candidates) {
  if (!candidates.length) return 0;
  return Math.max(...candidates.map((candidate) => textSimilarity(value, candidate)));
}

function setPrecision(actual, expected) {
  if (!actual.size || !expected.size) return null;
  const hit = [...actual].filter((item) => expected.has(item)).length;
  return hit / actual.size;
}

function setRecall(actual, expected) {
  if (!expected.size) return null;
  const hit = [...expected].filter((item) => actual.has(item)).length;
  return hit / expected.size;
}

function ngrams(value, size) {
  if (value.length <= size) return new Set([value]);
  const output = new Set();
  for (let index = 0; index <= value.length - size; index += 1) {
    output.add(value.slice(index, index + size));
  }
  return output;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .toLowerCase();
}

function arrayOfStrings(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()) : [];
}

function emptyScore() {
  return {
    dispositionMatch: null,
    memorySimilarity: 0,
    memoryAutoAccepted: null,
    contentTypeMatch: null,
    riskDomainMatch: null,
    retentionIntentMatch: null,
    questionTypeMatch: null,
    answerMatch: null,
    evidencePrecision: null,
    evidenceRecall: null
  };
}
