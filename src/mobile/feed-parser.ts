export interface ParsedFeedItem {
  title?: string;
  link?: string;
  contentSnippet?: string;
  content?: string;
  summary?: string;
  isoDate?: string;
  pubDate?: string;
  guid?: string;
}

function localName(element: Element): string {
  return (element.localName || element.nodeName.split(":").pop() || "").toLowerCase();
}

function directChildren(element: ParentNode, names: string[]): Element[] {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  return Array.from(element.children).filter((child) => wanted.has(localName(child)));
}

function firstChildText(element: Element, names: string[]): string | undefined {
  const child = directChildren(element, names)[0];
  const value = child?.textContent?.trim();
  return value || undefined;
}

function allElements(document: Document, name: string): Element[] {
  const wanted = name.toLowerCase();
  return Array.from(document.getElementsByTagName("*")).filter((element) => localName(element) === wanted);
}

function rssItem(element: Element): ParsedFeedItem {
  const publication = firstChildText(element, ["date", "pubdate"]);
  return {
    title: firstChildText(element, ["title"]),
    link: firstChildText(element, ["link"]),
    contentSnippet: firstChildText(element, ["description"]),
    content: firstChildText(element, ["encoded", "content"]),
    summary: firstChildText(element, ["summary"]),
    isoDate: publication,
    pubDate: firstChildText(element, ["pubdate"]),
    guid: firstChildText(element, ["guid"]),
  };
}

function atomLink(element: Element): string | undefined {
  const links = directChildren(element, ["link"]);
  const alternate = links.find((link) => (link.getAttribute("rel") || "alternate").toLowerCase() === "alternate");
  const target = alternate ?? links[0];
  return target?.getAttribute("href")?.trim() || target?.textContent?.trim() || undefined;
}

function atomItem(element: Element): ParsedFeedItem {
  const publication = firstChildText(element, ["updated", "published"]);
  return {
    title: firstChildText(element, ["title"]),
    link: atomLink(element),
    contentSnippet: firstChildText(element, ["summary"]),
    content: firstChildText(element, ["content"]),
    summary: firstChildText(element, ["summary"]),
    isoDate: publication,
    pubDate: firstChildText(element, ["published"]),
    guid: firstChildText(element, ["id"]),
  };
}

export function parseFeed(xml: string): ParsedFeedItem[] {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (allElements(document, "parsererror").length > 0) {
    throw new Error("Feed XML could not be parsed");
  }

  const rssItems = allElements(document, "item");
  if (rssItems.length > 0) return rssItems.map(rssItem);
  return allElements(document, "entry").map(atomItem);
}
