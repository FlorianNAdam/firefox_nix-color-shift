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

      nix-color-shift = pkgs.stdenv.mkDerivation {
        name = "${pname}-${version}";
        inherit src;

        buildInputs = [ pkgs.zip ];

        buildCommand = ''
          dst="$out/share/mozilla/extensions/{ec8030f7-c20a-464f-9b0e-13a3a9e97384}"
          mkdir -p "$dst"

          cd $src

          zip -r "$dst/${addonId}.xpi" *
        '';

        passthru = { inherit addonId; };
      };
    in
    {
      packages.${system} = {
        inherit nix-color-shift;
        default = nix-color-shift;
      };
    };
}
