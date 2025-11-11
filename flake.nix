{
  description = "Hello World Firefox addon with custom buildFirefoxXpiAddon";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

    firefox-addons = {
      url = "gitlab:rycee/nur-expressions?dir=pkgs/firefox-addons";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    {
      self,
      nixpkgs,
      firefox-addons,
    }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };
      lib = pkgs.lib;

      nameFromString =
        str:
        let
          chars = lib.strings.stringToCharacters str;

          splitCamel = builtins.foldl' (
            acc: c:
            if acc == "" then
              c
            else if c >= "A" && c <= "Z" then
              acc + "-" + lib.strings.toLower c
            else
              acc + lib.strings.toLower c
          ) "" chars;

          withHyphens = builtins.replaceStrings [ " " ] [ "-" ] splitCamel;
          normalized = builtins.replaceStrings [ "--" ] [ "-" ] withHyphens;
        in
        normalized;

      src = ./.;
      manifest = builtins.fromJSON (builtins.readFile "${src}/manifest.json");

      name = nameFromString manifest.name;
      version = manifest.version;
      addonId = manifest.browser_specific_settings.gecko.id;

      color-shift = firefox-addons.lib.${system}.buildFirefoxXpiAddon {
        pname = name;
        inherit version addonId;

        url = "https://github.com/FlorianNAdam/firefox_color-shift/releases/download/v${version}/colorshift.xpi";
        sha256 = "sha256-EJQkD2FMhxuGNpdTKEbKl4jS7oYgUpo6kIM/WH3y2lw=";

        meta = {
          description = manifest.description;
        };
      };

      color-shift-test = pkgs.stdenv.mkDerivation {
        name = "${name}-${version}";
        inherit src;

        buildInputs = [ pkgs.zip ];

        buildCommand = ''
          dst="$out/share/mozilla/extensions/{ec8030f7-c20a-464f-9b0e-13a3a9e97384}"
          mkdir -p "$dst"

          cd $src

          zip -r "$dst/${addonId}.xpi" *.js *.json
        '';

        passthru = { inherit addonId; };
      };
    in
    {
      packages.${system} = {
        inherit color-shift-test color-shift;
        default = color-shift;
      };
    };
}
