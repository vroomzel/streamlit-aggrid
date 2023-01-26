from setuptools import setup

with open('requirements.txt', "r") as fh:
    install_requires = fh.read().split()

__version__ = None
with open('st_aggrid/_version.py', 'r') as fh:
    exec(fh.readline())

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="st-aggrid",
    version=__version__,
    packages=['st_aggrid'],
    package_data={
        'st_aggrid': ['frontend/build/*'],
    },
    install_requires=install_requires,
    author="Pablo Fonseca",
    author_email="pablo.fonseca+pip@gmail.com",
    description="Streamlit component implementation of ag-grid",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/PablocFonseca/streamlit-aggrid",
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
    ],
    python_requires='>=3.6',
)