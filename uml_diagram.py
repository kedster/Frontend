import re
from pathlib import Path

def extract_js_functions(js_code: str):
    # Remove single line comments
    js_code = re.sub(r'//.*', '', js_code)
    # Remove multiline comments
    js_code = re.sub(r'/\*.*?\*/', '', js_code, flags=re.DOTALL)

    function_names = set()

    # Match function declarations: function funcName(...)
    pattern_func_decl = re.compile(r'\bfunction\s+([a-zA-Z_$][\w$]*)\s*\(')
    function_names.update(pattern_func_decl.findall(js_code))

    # Match function expressions assigned to variables: const funcName = function(...)
    pattern_func_expr = re.compile(r'\b(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=\s*function\b')
    function_names.update(pattern_func_expr.findall(js_code))

    # Match arrow functions: const funcName = (...) => or const funcName = param => 
    pattern_arrow_func = re.compile(r'\b(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=\s*\(?.*?\)?\s*=>')
    function_names.update(pattern_arrow_func.findall(js_code))

    return sorted(function_names)

def main():
    js_file = Path("script.js")
    if not js_file.exists():
        print(f"❌ JavaScript file not found: {js_file.resolve()}")
        return

    js_code = js_file.read_text(encoding='utf-8')
    functions = extract_js_functions(js_code)

    if functions:
        print("Functions found:")
        for func in functions:
            print(f" - {func}")
    else:
        print("No functions found.")

if __name__ == "__main__":
    main()
