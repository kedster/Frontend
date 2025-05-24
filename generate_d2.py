from bs4 import BeautifulSoup, Tag
import uuid
from pathlib import Path

ALLOWED_TAGS = {
    'button',
    'input',
    'textarea',
    'select',
    'div',
    'span',
    'label',
    'section',
}

ALLOWED_INPUT_TYPES = {
    'text', 'password', 'email', 'number', 'search', 'tel', 'url', 'checkbox', 'radio'
}

def tag_to_label(tag: Tag) -> str:
    label = tag.name
    if tag.get("id"):
        label += f'#{tag["id"]}'
    elif tag.get("class"):
        label += f'.{".".join(tag["class"])}'
    if tag.get("title"):
        label += f' (title="{tag["title"]}")'
    if tag.name == "input" and tag.get("type"):
        label += f' [type="{tag["type"]}"]'

    # Escape double quotes and remove line breaks to make label D2-safe
    label = label.replace('"', '\\"').replace('\n', ' ').strip()
    return label

def is_relevant_tag(tag: Tag) -> bool:
    if tag.name not in ALLOWED_TAGS:
        return False
    if tag.name == "input":
        return tag.get("type", "text").lower() in ALLOWED_INPUT_TYPES
    return True

def has_meaningful_text(tag: Tag) -> bool:
    if tag.string and tag.string.strip():
        return True
    for content in tag.contents:
        if isinstance(content, str) and content.strip():
            return True
    return False

def walk_dom_with_links(node, parent_id=None, elements=None, edges=None, uid_gen=None):
    if elements is None:
        elements = []
    if edges is None:
        edges = []
    if uid_gen is None:
        uid_gen = lambda: str(uuid.uuid4())

    if not isinstance(node, Tag):
        return None

    relevant_children_uids = []
    for child in node.children:
        child_uid = walk_dom_with_links(child, parent_id=None, elements=elements, edges=edges, uid_gen=uid_gen)
        if child_uid:
            relevant_children_uids.append(child_uid)

    is_relevant = False
    if is_relevant_tag(node):
        is_relevant = True
    elif node.name in {'div', 'span', 'section', 'label'}:
        if has_meaningful_text(node) or relevant_children_uids:
            is_relevant = True

    if is_relevant:
        uid = uid_gen()
        label = tag_to_label(node)
        elements.append((uid, label))
        if parent_id:
            edges.append((parent_id, uid))

        for child_uid in relevant_children_uids:
            edges.append((uid, child_uid))

        return uid

    return None

def generate_d2_from_html(html_content: str) -> str:
    soup = BeautifulSoup(html_content, 'html.parser')
    body = soup.body or soup  # fallback to root if no body
    elements, edges = [], []
    walk_dom_with_links(body, parent_id=None, elements=elements, edges=edges)

    lines = []
    for uid, label in elements:
        lines.append(f'{uid}: "{label}"')

    for parent, child in edges:
        lines.append(f'{parent} -> {child}')

    return '\n'.join(lines)

def main():
    html_file = Path("index.html")
    output_file = Path("diagram.d2")

    if not html_file.exists():
        print(f"❌ HTML file not found: {html_file.resolve()}")
        return

    html_content = html_file.read_text(encoding="utf-8")
    d2_text = generate_d2_from_html(html_content)

    output_file.write_text(d2_text, encoding="utf-8")
    print(f"✅ D2 output written to {output_file.resolve()}")

if __name__ == "__main__":
    main()
