import Foundation

/// A parsed XML element.
///
/// KML and GPX are both small, deeply nested documents that this app reads
/// once and converts; a tree is easier to be correct about than a streaming
/// walk with a state machine, and the file-size gate upstream bounds how big
/// the tree can get.
public final class XmlElement: @unchecked Sendable {
    /// The element's name with any namespace prefix stripped.
    ///
    /// Prefixes are dropped rather than resolved because real exports from
    /// consumer GPS units and older desktop tools routinely omit, misspell or
    /// invent namespaces. Refusing those would fail files that are otherwise
    /// perfectly readable, and nothing here means two different things in two
    /// different namespaces.
    public let name: String
    public let attributes: [String: String]
    public private(set) var children: [XmlElement] = []
    public private(set) var text: String = ""

    init(name: String, attributes: [String: String]) {
        self.name = name
        self.attributes = attributes
    }

    fileprivate func append(child: XmlElement) { children.append(child) }
    fileprivate func append(text fragment: String) { text += fragment }

    /// The element's text with surrounding whitespace removed.
    public var trimmedText: String {
        text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    public func children(named name: String) -> [XmlElement] {
        children.filter { $0.name == name }
    }

    public func firstChild(named name: String) -> XmlElement? {
        children.first { $0.name == name }
    }

    /// Every descendant with this name, at any depth, in document order.
    ///
    /// Order is not cosmetic here: it decides which style a placemark that
    /// names two gets, and the order features are numbered and drawn in. A
    /// traversal that returned them shuffled would give a KML a different
    /// answer on this surface than the web gives it on the same file.
    public func descendants(named name: String) -> [XmlElement] {
        var found: [XmlElement] = []
        for child in children {
            if child.name == name { found.append(child) }
            found.append(contentsOf: child.descendants(named: name))
        }
        return found
    }
}

/// Parsing an XML document into a tree, or refusing it.
public enum XmlTree {
    public static func parse(_ data: Data) throws(UserMapImportRefusal) -> XmlElement {
        let builder = Builder()
        let parser = XMLParser(data: data)
        parser.shouldProcessNamespaces = false
        parser.delegate = builder
        guard parser.parse(), let root = builder.root else {
            throw UserMapImportRefusal(
                code: .corruptFile,
                userMessage: "Couldn't read this file — the XML inside it is malformed."
            )
        }
        return root
    }

    private final class Builder: NSObject, XMLParserDelegate {
        var root: XmlElement?
        private var stack: [XmlElement] = []

        func parser(
            _ parser: XMLParser, didStartElement elementName: String,
            namespaceURI: String?, qualifiedName: String?,
            attributes: [String: String] = [:]
        ) {
            let name = elementName.split(separator: ":").last.map(String.init) ?? elementName
            let element = XmlElement(name: name, attributes: attributes)
            stack.last?.append(child: element)
            if root == nil { root = element }
            stack.append(element)
        }

        func parser(
            _ parser: XMLParser, didEndElement elementName: String,
            namespaceURI: String?, qualifiedName: String?
        ) {
            stack.removeLast()
        }

        func parser(_ parser: XMLParser, foundCharacters string: String) {
            stack.last?.append(text: string)
        }

        /// CDATA is text, not markup. KML descriptions carry HTML inside CDATA
        /// as a matter of course, and it is kept exactly as authored: nothing
        /// downstream renders a property as markup, so it stays the string the
        /// author wrote rather than being stripped into something else.
        func parser(_ parser: XMLParser, foundCDATA CDATABlock: Data) {
            guard let text = String(data: CDATABlock, encoding: .utf8) else { return }
            stack.last?.append(text: text)
        }
    }
}
