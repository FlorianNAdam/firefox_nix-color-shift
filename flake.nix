{
  description = "Hello World Firefox addon with custom buildFirefoxXpiAddon";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };

      pname = "nix-color-shift";
      src = ./.;

      manifest = builtins.fromJSON (builtins.readFile "${src}/manifest.json");

      version = manifest.version;
      addonId = manifest.browser_specific_settings.gecko.id;

      nix-color-shift =
        { pkgs, palette }:
        let
          palette-str = builtins.toJSON palette;
        in
        pkgs.stdenv.mkDerivation {
          name = "${pname}-${version}";
          inherit src;

          buildInputs = [ pkgs.zip ];

          buildCommand = ''
            dst="$out/share/mozilla/extensions/{ec8030f7-c20a-464f-9b0e-13a3a9e97384}"
            mkdir -p "$dst"

            cp -r "$src" ".build"
            chmod -R u+w ".build"

            echo '${palette-str}' > ".build/palette.json"

            cd .build
            zip -r "$dst/${addonId}.xpi" *
          '';

          passthru = { inherit addonId; };
        };
    in
    {
      packages.${system} = {
        inherit nix-color-shift;
        default = nix-color-shift {
          inherit pkgs;
          palette = [
            "#282828"
            "#3c3836"
            "#504945"
            "#665c54"
            "#bdae93"
            "#d5c4a1"
            "#ebdbb2"
            "#fbf1c7"
          ];
        };
      };
    };
}
