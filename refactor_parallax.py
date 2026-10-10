import os
import subprocess

IGNORE_DIRS = {'.git', 'node_modules', '__pycache__', 'dist', 'artifacts', 'fixtures'}
IGNORE_EXTS = {'.png', '.jpg', '.jpeg', '.gif', '.zip', '.pdf', '.svg', '.onnx', '.ubj', '.geojson', '.tmp'}

REPLACEMENTS = [
    # Protect team name
    ("__TEAM_PARALLAX__", "__TEAM_PARALLAX__"),
    ("__team_parallax__", "__team_parallax__"),
    ("__Team_parallax__", "__Team_parallax__"),
    
    # Specific project names
    ("Parallax Fire", "Parallax Fire"),
    ("Parallax Fire", "Parallax Fire"),
    ("parallax-fire", "parallax-fire"),
    ("parallax_fire", "parallax_fire"),
    ("parallax_app", "parallax_app"),
    
    # Prefixes
    ("parallax_", "parallax_"),
    ("PARALLAX_", "PARALLAX_"),
    ("parallax-", "parallax-"),
    
    # General fallbacks
    ("Parallax", "Parallax"),
    ("parallax", "parallax"),
    
    # Restore team name
    ("__TEAM_PARALLAX__", "__TEAM_PARALLAX__"),
    ("__team_parallax__", "__team_parallax__"),
    ("__Team_parallax__", "__Team_parallax__"),
]

def rename_content(file_path):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except UnicodeDecodeError:
        return False # likely binary

    new_content = content
    for old, new in REPLACEMENTS:
        new_content = new_content.replace(old, new)
        
    if new_content != content:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        return True
    return False

def rename_file_or_dir(path):
    dir_name, base_name = os.path.split(path)
    new_base_name = base_name
    
    # Apply replacements to the filename
    for old, new in REPLACEMENTS:
        new_base_name = new_base_name.replace(old, new)
        
    # We don't want "__TEAM_PARALLAX__" logic affecting filenames realistically, but it's fine.
    
    if new_base_name != base_name:
        new_path = os.path.join(dir_name, new_base_name)
        # Use git mv if possible, else os.rename
        try:
            subprocess.run(["git", "mv", path, new_path], check=True, capture_output=True)
            print(f"Git renamed {path} -> {new_path}")
        except subprocess.CalledProcessError:
            os.rename(path, new_path)
            print(f"OS renamed {path} -> {new_path}")
        return new_path
    return path

def main():
    # Phase 1: File contents
    for root, dirs, files in os.walk('.', topdown=True):
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
        
        for file in files:
            ext = os.path.splitext(file)[1].lower()
            if ext in IGNORE_EXTS:
                continue
            
            file_path = os.path.join(root, file)
            if rename_content(file_path):
                print(f"Updated content in {file_path}")

    # Phase 2: File and folder names (bottom up to avoid path invalidation)
    for root, dirs, files in os.walk('.', topdown=False):
        # Filter out ignored dirs (even bottom up, we just don't process them)
        if any(ignored in root.split(os.sep) for ignored in IGNORE_DIRS):
            continue
            
        for file in files:
            file_path = os.path.join(root, file)
            rename_file_or_dir(file_path)
            
        for d in dirs:
            if d in IGNORE_DIRS:
                continue
            dir_path = os.path.join(root, d)
            rename_file_or_dir(dir_path)

if __name__ == '__main__':
    main()
